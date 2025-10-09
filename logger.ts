namespace logger {

    // Replicate console logs to Huskylens
    // (only warnings and errors)
    let osd_log_line_nb = 0
    export function log_osd(priority: ConsolePriority, msg: string) {
        if ((HUSKY_WIRED) && (priority == ConsolePriority.Warning || priority==ConsolePriority.Error))
            huskylens.writeOSD(msg, 0, osd_log_line_nb * 20)
        osd_log_line_nb = osd_log_line_nb + 1
        if (osd_log_line_nb == 19) { osd_log_line_nb = 1 }
    }

    export function initializeLogToScreen() {
        if (HUSKY_WIRED) {
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

    export function send_telemetry() {
        //  Log metrics and update Display
        if (HUSKY_WIRED) {
            if(robot != null) {
                huskylens.writeOSD("state " + robot.state, 150, 30)
            } 
            let wp = motion.getWaypoint()
            if (wp != null) {
                huskylens.writeOSD("WP " + wp.distance + " " + wp.angle, 150, 30)
            }
            if (vision != null) {
                huskylens.writeOSD("tags " + vision.tags.length, 150, 90)
                huskylens.writeOSD("balls " + vision.balls.length, 150, 120)
                let b = vision.getClosestBall();
                if (b != null) {
                    huskylens.writeOSD("ball dist: " + b.getDistanceInPixels(), 150, 150)
                    huskylens.writeOSD("ball angl: " + b.getAngleDegrees(), 150, 180)
                }
            }
        }

        if ([ExecMode.MakeCode, ExecMode.WiredMode].indexOf(EXEC_MODE) >= 0) {
            datalogger.log(datalogger.createCV("balls", vision.balls.length))
        }
    }
}