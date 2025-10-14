namespace logger {

    // OSD Display positions for telemetry data
    enum OSDPosition {
        LINE_1 = 30,        // Robot state
        LINE_2 = 60,        // Waypoint info
        LINE_3 = 90,        // Tags count
        LINE_4 = 120,       // Balls count
        LINE_5 = 150,       // Ball distance
        LINE_6 = 180,       // Ball angle
        LINE_7 = 200,       // Acceleration
        TELEMETRY_X = 150,
        LOG_X = 0
    }

    // Replicate console logs to Huskylens
    // (only warnings and errors)
    let osd_log_line_nb = 0
    export function log_osd(priority: ConsolePriority, msg: string) {
        if ((HUSKY_WIRED) && (priority == ConsolePriority.Warning || priority==ConsolePriority.Error))
            huskylens.writeOSD(msg, OSDPosition.LOG_X, osd_log_line_nb * 20)
        osd_log_line_nb = osd_log_line_nb + 1
        if (osd_log_line_nb == 19) { osd_log_line_nb = 1 }
    }

    export function initializeLogToScreen() {
        if (HUSKY_WIRED && LOG_TO_OSD) {
            huskylens.clearOSD;
            console.addListener(log_osd)
        }
    }

    export function error(msg: string){
        console.error(msg)
    }
    export function warning(msg: string) {
        console.warn(msg)
    }
    export function info(msg: string) {
        console.log(msg)
    }
    export function debug(msg: string) {
        console.debug(msg)
    }

    function formatElapsedTime(elapsedMs: number): string {
        // Ensure non-negative value
        const totalMs = Math.max(0, Math.floor(elapsedMs));
        // Extract components
        const minutes = Math.floor(totalMs / 60000);
        const seconds = Math.floor((totalMs % 60000) / 1000);
        const milliseconds = totalMs % 1000;
        // Format with leading zeros using custom padding
        const formattedMinutes = (minutes < 10 ? "0" : "") + minutes.toString();
        const formattedSeconds = (seconds < 10 ? "0" : "") + seconds.toString();
        const formattedMs = (milliseconds < 100 ? (milliseconds < 10 ? "00" : "0") : "") + milliseconds.toString();
        return `${formattedMinutes}m${formattedSeconds}s${formattedMs}ms`;
    }

    function get_log_msg(logmsg: string): string {
        return "[" + control.deviceName() + "@" + ("" + ("" + formatElapsedTime(control.millis()))) + " (" + cyclesCount + ")]" + " " + logmsg
    }
    // Logging function to Serial Monitor or Bluetooth
    export function log(msg: string) {
        msg = get_log_msg(msg);
        switch (EXEC_MODE) {
            case ExecMode.MakeCode:
            case ExecMode.WiredMode:
                console.log(msg);
                break;
            case ExecMode.GameMode:
            case ExecMode.FreeMode:
                // disabled for the moment
                //if (bluetooth_connected){ bluetooth.uartWriteLine(msg) }

                // the radio channel is used for communication with the game controller
                // so we cannot use it for logging
                //radio.sendString(msg);
                break;
            default:
                break;
        }
    }

    export function update_osd() {
        //  Update OSD Display with telemetry data
        if (HUSKY_WIRED) {
            if(robot != null) {
                huskylens.writeOSD(`state ${robot.state}`, OSDPosition.TELEMETRY_X, OSDPosition.LINE_1)
            } 
            let wp = motion.getWaypoint()
            if (wp != null) {
                huskylens.writeOSD(`WP ${wp.distance} ${wp.angle}`, OSDPosition.TELEMETRY_X, OSDPosition.LINE_2)
            }
            if (vision != null) {
                huskylens.writeOSD(`tags ${vision.tags.length}`, OSDPosition.TELEMETRY_X, OSDPosition.LINE_3)
                huskylens.writeOSD(`balls ${vision.balls.length}`, OSDPosition.TELEMETRY_X, OSDPosition.LINE_4)
                let b = vision.getClosestBall();
                if (b != null) {
                    huskylens.writeOSD(`ball dist: ${b.getDistanceInPixels()}`, OSDPosition.TELEMETRY_X, OSDPosition.LINE_5)
                    huskylens.writeOSD(`ball angl: ${b.getAngleDegrees()}`, OSDPosition.TELEMETRY_X, OSDPosition.LINE_6)
                }
                if (ENABLE_OBSTACLE_DETECTION)
                    huskylens.writeOSD(`Motion: ${motionDetector.motionIntensity}`, OSDPosition.TELEMETRY_X, OSDPosition.LINE_7)

            }
        }
    }

    export function write_telemetry() {
        //  Log telemetry data to datalogger
        if ([ExecMode.MakeCode, ExecMode.WiredMode].indexOf(EXEC_MODE) >= 0) {
            datalogger.log(datalogger.createCV("balls", vision.balls.length))
        }
    }

}