// Timing Constants
const GAME_DURATION = 40; // seconds
const DELAY_TO_GO_HOME = 20; // seconds
const OBJECT_LOST_DELAY = 1; // second
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
// Parameters
const FOR_LATER_USE_SERVO = 1
const DIRECTION_SERVO = 2
const GRABBER_MOTOR = 3
const SPEED_MOTOR = 4
const HUSKY_WIRED = false; // true if the HuskyLens is wired with I2C

// Execution Mode Parameters
enum ExecMode {
    MakeCode, // Offline software development with no attached board
    FreeMode, // Free running Robot
    GameMode, // Board wired with USB
    WiredMode, // Board wired with USB
}

// Global Variables
let EXEC_MODE = ExecMode.MakeCode;
let cyclesCount = 0;
let initialized = false;

let bricksGame = new BricksGame();
let robot = new Robot()
let vision = new vision_ns.VisionProcessor(
    protocolAlgorithm.ALGORITHM_TAG_RECOGNITION,
    vision_ns.ObjectKind.QRcode
);
vision.verbose = false


function init() {
    // Initialization of the sensors, variables, display, callbacks
    basic.clearScreen();
    initButtonsEvents();
    // Boot sequence
    music.setVolume(255)
    music.playMelody(imperial_march.join(" "), 150)
    // Initialize servo controller
    ServoController.init()
    ServoController.centerAllServos()
    ServoController.testAllServos([FOR_LATER_USE_SERVO, DIRECTION_SERVO])
    MotorController.testAllMotors([GRABBER_MOTOR, SPEED_MOTOR])
    logger.log("Expansion board health check completed");
    // Initialize physical sensors
    if (EXEC_MODE != ExecMode.MakeCode) {
        input.calibrateCompass()
        input.setAccelerometerRange(AcceleratorRange.OneG)
        logger.log("Calibration completed");
        if (HUSKY_WIRED) {
            vision.init();
            vision.refresh();
            logger.initializeLogToScreen()
            logger.log("Camera connected");
        }
    }
    // Disabled Bluetooth for the moment
    // pxt build > error: conflict on yotta setting microbit-dal.bluetooth.enabled between extensions radio and bluetooth
    //initBluetooth();
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
    // Function called every 100ms
}

function onEvery200ms() {
    //    send_telemetry();
}

function onEvery1s() {
    // Function called every 500ms
}
function onEvery5s() {
    logger.log("Remaining time " + bricksGame.remainingTime())
}

loops.everyInterval(100, onEvery100ms);
loops.everyInterval(200, onEvery200ms);
loops.everyInterval(1000, onEvery1s);
loops.everyInterval(5000, onEvery5s);

function onForever() {
    // Infinite loop (frequency = ?? Hz)
    if (!initialized) { // https://support.microbit.org/support/solutions/articles/19000053084-forever-runs-before-onstart-finishes
        return;
    }
    cyclesCount++;
    vision.refresh();
    position.updateSensors();
    position.updateEnvironment();
    robot.updateObjective();
    robot.computeNextWaypoint();
    motion.goToWaypoint();
}

// best effort loop
basic.forever(onForever);
