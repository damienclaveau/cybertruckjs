// Timing Constants
const GAME_DURATION = 4000; // seconds !!! As long as we don't handle the Stop/Danger instructions correctly, this is one way to go baack to home
const DELAY_TO_GO_HOME = 0; // seconds 
const OBJECT_LOST_DELAY = 1; // second

// CONSTANTS to control the robot during tests
const ENABLE_OBSTACLE_DETECTION = true; // Set to true only if obstacle detection features are needed
const ENABLE_OSD_DISPLAY = true; // Set to false to disable variable display on Husky Lens
const OBSTACLE_DETECTION_THRESHOLD = 150; //mg, below this threshold, the robot is considered stalled
const LOG_TO_OSD = false;
// CONSTANTS to control the robot during contests
const MIN_SPEED = -100;
const MAX_SPEED = 100;


// Music constants :-)
const imperial_march = [
    "G4:6", "R:1", "G4:6", "R:1", "G4:6",
    "D#4:6", "A#4:2", "G4:6",
    "D#4:6", "A#4:2", "G4:6"
]
const windows_xp = [
    "D#5:3", "A#4:5", "G#4:6",
    "D#5:3", "A#4:12"
]
const police = [
    "A5:4", "D5:4", "A5:4", "D5:4", "A5:4", "D5:4", "A5:4", "D5:4"
]
const police2 = [
    "A4:4", "D4:4", "A4:4", "D4:4", "A4:4", "D4:4", "A4:4", "D4:4"
]
const backward = [
    "B:4", "", "B:4", "","B:4", "", "B:4", ""
]


// Parameters
const CAMERA_SERVO = 1
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
const HUSKY_WIRED = true; // true if the HuskyLens is wired with I2C
let EXEC_MODE = ExecMode.GameMode; // change this to WiredMode in order to have the logging on serial
let cyclesCount = 0;
let initialized = false;

let bricksGame = new BricksGame();
let robot = new Robot()
let vision = new vision_ns.VisionProcessor(
    protocolAlgorithm.ALGORITHM_COLOR_RECOGNITION,
    vision_ns.ObjectKind.Ball
);
vision.verbose = true
const arena = new position.ArenaMap();
const motionDetector = new motion.MotionDetector();
if (ENABLE_OBSTACLE_DETECTION) {
    motionDetector.setOnBlockedCallback(() => {
        robot.handleBlockedState();
    });
    motionDetector.setOnMovingCallback(() => {
        robot.handleMovingHeartbeat();
    });
}


function init() {
    // Initialization of the sensors, variables, display, callbacks
    basic.clearScreen();
    initButtonsEvents();
    bricksGame.init();
    logger.log(`deviceName: ${control.deviceName()} deviceSerialNumber: ${control.deviceSerialNumber()} ramSize:${control.ramSize()}` );
    // Boot sequence
    music.setVolume(255)
    //music.playMelody(imperial_march.join(" "), 150)
    // Initialize servo controller
    ServoController.init()
    ServoController.centerAllServos()
    // stop punching the camera
    ServoController.testAllServos([DIRECTION_SERVO])
    MotorController.testAllMotors([GRABBER_MOTOR, SPEED_MOTOR])
    ServoController.setServo(CAMERA_SERVO, -10) // tilt the camera a bit down

    logger.log("Expansion board health check completed");
    // Initialize physical sensors
    if (EXEC_MODE != ExecMode.MakeCode) {
        // this must be done separately, only once
        //input.calibrateCompass()
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
    if (EXEC_MODE == ExecMode.GameMode || EXEC_MODE == ExecMode.WiredMode) {
        initGameControl();
        logger.log("Radio connected");
    }
    initialized = true;
    logger.log("Initialization completed");
}

init();

// scheduled function calls
function onEvery100ms() {
    // Function called every 100ms
}

function onEvery200ms() {
    //TO DO : test this
    //send_telemetry();
}
// Simulate the game countdown
function onEvery1s() {
    if ((bricksGame.status == GameState.Started)
        && (bricksGame.remainingTime() < 0)) {
        bricksGame.doStop()
    }
}
function onEvery3s() {
    // TO DO : Test this idea
    // every 5s (maybe more often) have a look around at the QRCodes
    // vision.refreshForced(protocolAlgorithm.ALGORITHM_TAG_RECOGNITION, vision_ns.ObjectKind.QRcode)
}

function onEvery5s() {
    logger.log("Game " + bricksGame.status+ ", Remaining time " + bricksGame.remainingTime())
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
    vision.refresh(); 
    //arena.updateRobotPosition(vision.tags, input.compassHeading());
    robot.updateObjective();
    robot.computeNextWaypoint();
    motion.goToWaypoint();
    if (ENABLE_OBSTACLE_DETECTION)
    	motionDetector.update();
    if (ENABLE_OSD_DISPLAY)
    	logger.update_osd();
}

// best effort loop
basic.forever(onForever);
