namespace logger {

    // Replicate console logs to Huskylens
    let osd_log_line = 0
    export function initializeLogToScreen() {
        function log_to_screen(priority: ConsolePriority, msg: string) {
            huskylens.writeOSD(msg, 0, osd_log_line * 20)
            osd_log_line = osd_log_line + 1
            if (osd_log_line == 19) { osd_log_line = 1 }
        }
        huskylens.clearOSD;
        console.addListener(log_to_screen)
    }

    export function debug(text: string) {
        console.debug(text)
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
        return `${formattedMinutes}:${formattedSeconds}:${formattedMs}`;
    }

    function get_log_msg(logmsg: string): string {
        return "[" + control.deviceName() + "@" + ("" + ("" + formatElapsedTime(control.millis()))) + " (" + cyclesCount + ")]" + " : " + logmsg
    }
    // Logging function to Serial Monitor or Bluetooth
    export function log(msg: string) {
        msg = get_log_msg(msg);
        switch (EXEC_MODE) {
            case ExecMode.MakeCode:
            case ExecMode.WiredMode:
                serial.writeLine(msg);
                //console.log(msg);
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
            //    huskylens.writeOSD("angle diff "+str(steering_angle), 150, 30)
            //    huskylens.writeOSD("servo_angle "+str(servo_angle), 150, 60)
            //    huskylens.writeOSD("input "+str(steering_value), 150, 90)
            huskylens.writeOSD("balls " + ("" + vision.balls.length), 150, 120)
        }

        if ([ExecMode.MakeCode, ExecMode.WiredMode].indexOf(EXEC_MODE) >= 0) {
            datalogger.log(datalogger.createCV("balls", vision.balls.length))
        }
    }
}