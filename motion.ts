namespace motion {

    enum MotionDirection {
        Idle,
        Forward,
        Backward,
        Spinning
    }

    enum MotionMode {
        Free, // choregraphed moves (is it blocking the thread of the main loop ?)
        Auto  // PID controlled moves
    }
    let motionMode = MotionMode.Auto

    const fullSpeed = 100
    const cruiseSpeed = 50
    const cruiseLinearSpeed = 30 // cm/s
    const spinSpeed = 50
    const spinAngularSpeed = 20 // degree/s

    /////////////////////////////////////////////////////////////////////////////////////////////
    // Motor Control
    function setThrottle(speed: number) {
        if (EXEC_MODE == ExecMode.MakeCode) {// for simulation mode only
            servos.P1.run(speed)
        } else {
            MotorController.setMotor(SPEED_MOTOR, speed)
        }
    }

    function setWheelSteering(steering: number) {
        if (EXEC_MODE == ExecMode.MakeCode) {// for simulation mode only
            servos.P0.setAngle(steering)
        } else {
            ServoController.setServo(DIRECTION_SERVO, steering)
        }
    }

    //////////////////////////////////////////////////////////////////
    // Naive straight movement
    export function moveStraight(distance: number){
        try {
            motionMode = MotionMode.Free
            setWheelSteering(0)
            if (distance > 0)
                setThrottle(cruiseSpeed)
            else
                setThrottle(cruiseSpeed*-1)
            // distance in cm, cruiseLinearSpeed in cm/s, result in milliseconds
            pause((distance / cruiseLinearSpeed) * 1000)
        } catch (error) {
            console.debug('An error occurred:' + error);
        } finally {
            motionMode = MotionMode.Auto
            setThrottle(0)
        }
    }

    //////////////////////////////////////////////////////////////////
    // Naive Spinning around
    export function spinAround(angle: number) {
        let currentHeading = input.compassHeading()
        let targetHeading = normalizeHeading(currentHeading + angle)
        try {
            motionMode = MotionMode.Free
            if (angle > 0) {
                setWheelSteering(-45)  // Turn right for positive angle
            } else if (angle < 0) {
                setWheelSteering( 45) // Turn left for negative angle
            } else {}// No rotation needed
            setThrottle(spinSpeed)
            // Wait until we reach the target heading (with tolerance)
            pauseUntil(() => {
                let currentCompass = input.compassHeading()
                return isHeadingReached(currentCompass, targetHeading, 5) // 5 degree tolerance
            })
            setThrottle(0)
            setWheelSteering(0)
        } catch (error) {
            console.debug('An error occurred:' + error);
        } finally {
            motionMode = MotionMode.Auto
            setThrottle(0)
        }
    }

    function normalizeHeading(heading: number): number {
        while (heading < 0) heading += 360
        while (heading >= 360) heading -= 360
        return heading
    }

    function isHeadingReached(current: number, target: number, tolerance: number): boolean {
        let diff = Math.abs(current - target)
        // Handle wrap-around (e.g., 359° to 1°)
        if (diff > 180) {
            diff = 360 - diff
        }
        return diff <= tolerance
    }

    /////////////////////////////////////////////////////////////////////////////////////////////
    // Auto Navigation to a Waypoint


    export class Waypoint {
        distance: number  //  mm
        angle: number // radians
        constructor(distance: number, angle: number) {
            this.distance = distance
            this.angle = angle
        }
    }
    let waypoint = new Waypoint(0, 0)

    // PID controller for angle correction : setPoint = 0 (i.e. angle to the waypoint should be reduced to 0)
    const anglePID = new pid_ns.PID(1.5, 0.2, 0.1, 0, {
        outputLimits: [-45, 45],  // Servo steering limits
        proportionalOnMeasurement: true,
        errorMap: (error: number) => {
            // Handle angle wrap-around (±180°)
            while (error > 180) error -= 360;
            while (error < -180) error += 360;
            return error;
        }
    });
    // PID controller for speed correction : setPoint = 0 (i.e. distance to the waypoint should be reduced to 0)
    const speedPID = new pid_ns.PID(1.5, 0.2, 0.1, 0, {
        outputLimits: [-100, 100],  // Motor speed limits
        proportionalOnMeasurement: true
    });

    export function setWaypoint(distance: number, angle: number, reset: boolean = false){
        waypoint.distance = distance
        waypoint.angle = angle
        if (reset) {
            anglePID.reset();
            speedPID.reset();
        }
    }
    
    export function goToWaypoint() {
        if (MotionMode.Free)
            return
        //logger.log("Going to Waypoint d="+waypoint.distance+" , a="+waypoint.angle)
        if (motionMode == MotionMode.Auto) {
            //  Drive servo and motor with PWM according to updated linear and angular velocities
            //  Set the steering servo position to aim to the waypoint
            let steering = anglePID.update(waypoint.angle)
            setWheelSteering(steering)

            //  Set the servo throttle power depending on the remaining distance to the waypoint
            let speed = speedPID.update(waypoint.distance)
            setThrottle(speed)
        }
    }

}
