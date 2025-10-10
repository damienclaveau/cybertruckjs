// Known bugs :
//#1 The gamebricksGame object is always started, can not figure out why
//#2 the getClosestBall function should determine the distance based on the y axis, the lower the closer, instead of the visual ratio
// To do :
//#1 Implement and Test the motion functions, for free motion (spin) and PID controlled motion(track)
//#2 Find the proper angle for the camera in order to determine min and max distance constants, and to calibrate the QR codes detection
//#3 Implement the occupenyGrid/positioning/triangulation algorithm based on Tags and Compass

// Timing Constants
const GAME_DURATION = 40; // seconds
const DELAY_TO_GO_HOME = 15; // seconds
const OBJECT_LOST_DELAY = 1; // second

// Microcontroller optimization flag - set to false for production to save Flash memory
const ENABLE_MUSIC = false; // Set to true only if music features are needed
const ENABLE_OBSTACLE_DETECTION = false; // Set to true only if obstacle detection features are needed
const ENABLE_POSITIONING = false; // Set to true only if positioning features are needed
const ENABLE_GAME_COUNTDOWN = true; // Set to false to disable game timeout checking 
const ENABLE_TELEMETRY = false; // Set to false to disable data logging
let imperial_march: string[] = [];
let windows_xp: string[] = [];
let police: string[] = [];
// Only allocate music data if explicitly enabled
if (ENABLE_MUSIC) {
    imperial_march = [
        "G4:6", "R:1", "G4:6", "R:1", "G4:6",
        "D#4:6", "A#4:2", "G4:6",
        "D#4:6", "A#4:2", "G4:6"
    ];
    windows_xp = [
        "D#5:3", "A#4:5", "G#4:6",
        "D#5:3", "A#4:12"
    ];
    police = [
        "A5:4", "D5:4", "A5:4", "D5:4", "A5:4", "D5:4", "A5:4", "D5:4"
    ];
}

// Parameters
const FOR_LATER_USE_SERVO = 1
const DIRECTION_SERVO = 2
const GRABBER_MOTOR = 3
const SPEED_MOTOR = 4

// Execution Mode Parameters
enum ExecMode {
    MakeCode, // Offline software development with no attached board
    FreeMode, // Free running Robot
    GameMode, // Board wired with USB
    WiredMode, // Board wired with USB
}

// Global Variables
const HUSKY_WIRED = false; // true if the HuskyLens is wired with I2C
let EXEC_MODE = ExecMode.MakeCode; // change this to WiredMode in order to have the logging on serial
let cyclesCount = 0;
let initialized = false;

const bricksGame = new BricksGame();
const robot = new Robot()
const vision = new vision_ns.VisionProcessor(
    protocolAlgorithm.ALGORITHM_COLOR_RECOGNITION,
    vision_ns.ObjectKind.Ball
);
vision.verbose = true

let arena = new position.ArenaMap();
const motionDetector = new motion.MotionDetector();
if (ENABLE_OBSTACLE_DETECTION) {
    motionDetector.setOnBlockedCallback(() => {
        robot.handleBlockedState();
    });
}

function init() {
    // Initialization of the sensors, variables, display, callbacks
    logger.log(`deviceName: ${control.deviceName()} deviceSerialNumber: ${control.deviceSerialNumber()} ramSize:${control.ramSize()}` );
    basic.clearScreen();
    initButtonsEvents();
    bricksGame.init();
    // Boot sequence
    // Play boot music only if enabled to save Flash memory
    if (ENABLE_MUSIC) {
        music.setVolume(255)
        music.playMelody(imperial_march.join(" "), 150)
    }
    // Initialize servo controller
    ServoController.init()
    ServoController.centerAllServos()
    ServoController.testAllServos([FOR_LATER_USE_SERVO, DIRECTION_SERVO])
    MotorController.testAllMotors([GRABBER_MOTOR, SPEED_MOTOR])
    // check the Motion API
    motion.setWheelSteering(0)
    pause(1000)
    motion.setWheelSteering(-45)
    pause(1000)
    motion.setWheelSteering(0)
    pause(1000)
    motion.setWheelSteering(45)
    pause(1000)
    motion.setWheelSteering(0)
    logger.log("Expansion board health check completed");

    // Initialize physical sensors
    if (EXEC_MODE != ExecMode.MakeCode) {
        input.setAccelerometerRange(AcceleratorRange.OneG)
        logger.log("Calibration completed");
        if (HUSKY_WIRED) {
            vision.init();
            vision.refresh();
            logger.initializeLogToScreen()
            logger.log("Camera connected");
        }
    }
    // Initialize Radio transmition with Game Server
    if (EXEC_MODE == ExecMode.GameMode) {
        initGameControl();
    }
    initialized = true;
    logger.log("Initialization completed");
}

init();

// scheduled function calls
function onEvery100ms() {
}

function onEvery200ms() {
    if (ENABLE_TELEMETRY) {
        logger.write_telemetry()
    }
}
// Simulate the game countdown
function onEvery1s() {
    if (ENABLE_GAME_COUNTDOWN) {
        bricksGame.update(); // Handle game timeout logic
    }
}
// regularly have a look at the visible QRCodes around
function onEvery3s() {
    if (ENABLE_POSITIONING) {
        vision.refreshForced(protocolAlgorithm.ALGORITHM_TAG_RECOGNITION, vision_ns.ObjectKind.QRcode)
        arena.updateRobotPosition(vision.tags, input.compassHeading());
    }
}

function onEvery5s() {
    logger.log(`Game ${bricksGame.status}, Remaining time ${bricksGame.remainingTime()}`)
}

loops.everyInterval(100, onEvery100ms);
loops.everyInterval(200, onEvery200ms);
loops.everyInterval(1000, onEvery1s);
loops.everyInterval(3000, onEvery3s);
loops.everyInterval(5000, onEvery5s);

function onForever() {
    // Infinite loop : this should contain time-critical functions, and not any pause
    if (!initialized) { // https://support.microbit.org/support/solutions/articles/19000053084-forever-runs-before-onstart-finishes
        return;
    }
    cyclesCount++;
    // TO DO : check if Huskylens capture frequency should be lower, like scheduled
    vision.refresh(); 
    if (ENABLE_POSITIONING)
        arena.updateRobotPosition(vision.tags, input.compassHeading());
    if (ENABLE_OBSTACLE_DETECTION)
        motionDetector.update();
    robot.updateObjective();
    robot.computeNextWaypoint();
    motion.goToWaypoint();
    logger.update_osd();
}

// best effort loop
basic.forever(onForever);
