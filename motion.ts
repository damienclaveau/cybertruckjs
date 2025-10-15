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
    export const clearanceMoves = [
        { throttle: fullSpeed * -1, steering:   0, duration: 3000 },
        { throttle: fullSpeed * -1, steering: -45, duration: 3000 },
        { throttle: fullSpeed * -1, steering:  45, duration: 3000 },
        { throttle: fullSpeed * -1, steering: -90, duration: 3000 },
        { throttle: fullSpeed * -1, steering:  90, duration: 3000 },
        ];
    export const clearanceMovesSequences = [
        [{ throttle: fullSpeed * -1, steering: -90, duration: 1000 },
        { throttle: fullSpeed * -1, steering: 0, duration: 1000 },
        { throttle: fullSpeed * 1, steering: 90, duration: 1500 }],
        [{ throttle: fullSpeed * -1, steering: 90, duration: 1000 },
        { throttle: fullSpeed * -1, steering: 0, duration: 1000 },
        { throttle: fullSpeed * 1, steering: -90, duration: 1500 }],
        [{ throttle: fullSpeed * -1, steering: 0, duration: 2000 },
            { throttle: fullSpeed * 1, steering: 90, duration: 3000 }]
    ];
    /////////////////////////////////////////////////////////////////////////////////////////////
    // Motor Control
    export function setThrottle(speed: number) {
        if (EXEC_MODE == ExecMode.MakeCode) {// for simulation mode only
            servos.P1.run(speed)
        } else {
            MotorController.setMotor(SPEED_MOTOR, speed)
        }
        // Start/stop motion detector based on throttle
        if (ENABLE_OBSTACLE_DETECTION) motionDetector.updateThrottle(speed);
    }

    export function setWheelSteering(steering: number) {
        if (EXEC_MODE == ExecMode.MakeCode) {// for simulation mode only
            servos.P0.setAngle(steering)
        } else {
            ServoController.setServo(DIRECTION_SERVO, steering)
        }
    }

    //////////////////////////////////////////////////////////////////
    // Straight movement : warning : BLOCKING function
    export function moveStraight(distance: number){
            motionMode = MotionMode.Free
            setWheelSteering(0)
            let s = fullSpeed
            if (distance < 0)
                s = s * -1
            // distance in cm, cruiseLinearSpeed in cm/s, result in milliseconds
            let runtime = Math.abs((distance / cruiseLinearSpeed) *1000)
            makeaMove(fullSpeed * -1, 0, runtime)
    }
    // Arbitrary sequence of movements
    export function doFreeMoveSequence(moves: { throttle: number; steering: number, duration: number }[]) {
        for (let i = 0; i < moves.length; i++) {
            let move = moves[i];
            makeaMove(move.throttle, move.steering, move.duration)
        }
    }

    // Arbitrary movement : warning : BLOCKING function
    export function makeaMove(throttle: number, steering: number, duration: number) {
        try {
            motionMode = MotionMode.Free
            logger.log(`Free move throttle: ${throttle} steering: ${steering}  duration: ${duration}`)
            setWheelSteering(steering)
            setThrottle(throttle)
            pause(duration)
        } catch (error) {
            console.debug('An error occurred:' + error);
        } finally {
            motionMode = MotionMode.Auto
            setThrottle(0)
            setWheelSteering(0)
        }
    }
    //////////////////////////////////////////////////////////////////
    // Naive Spinning around : warning : BLOCKING function
    export function spinAround(angle: number) {
        let currentHeading = input.compassHeading()
        let targetHeading = normalizeHeading(currentHeading + angle)
        try {
            motionMode = MotionMode.Free
            if (angle > 0) {
                setWheelSteering(-45)  // Turn right for positive angle
            } else if (angle < 0) {
                setWheelSteering(45) // Turn left for negative angle
            } else { }// No rotation needed
            setThrottle(spinSpeed)
            // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            // Wait until we reach the target heading (with tolerance)
            // never do this in MakeCode mode : it ends up in an infinite loop
            //if (EXEC_MODE != ExecMode.MakeCode)
            //    pauseUntil(() => {
            //        let currentCompass = input.compassHeading()
            //        return isHeadingReached(currentCompass, targetHeading, 15) // 15 degree tolerance
            //    })
            // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
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
        logger.log("Angle Diff"+diff)
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
    
    export function getWaypoint(){return waypoint}

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
        if (motionMode == MotionMode.Free)
            return
        //logger.log("Going to Waypoint d="+waypoint.distance+" , a="+waypoint.angle)
        if (motionMode == MotionMode.Auto) {
            //  Drive servo and motor with PWM according to updated linear and angular velocities
            //  Set the steering servo position to aim to the waypoint
            //let steering = anglePID.update(waypoint.angle)
            let steering = Math.max(-90, Math.min(90, -waypoint.angle))
            setWheelSteering(steering)

            //  Set the servo throttle power depending on the remaining distance to the waypoint
            let speed = waypoint.distance
            //let speed = speedPID.update(waypoint.distance)
            setThrottle(Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed)))
        }
    }




    // Motion Detection
    // the detector is active only when the motor has a minimum speed directive
    // it is checking every 1s if the robot had an average motion above a threshold
    export class MotionDetector {
        private samples: number[] = []
        private bufferIndex: number = 0
        private isActive: boolean = false
        private lastCheck: number = 0
        public motionIntensity: number = 0
        private onBlockedCallback: (() => void) | null = null
        private onMovingCallback: (() => void) | null = null
        // constants
        private readonly MAX_SAMPLES = 5
        private readonly CHECK_INTERVAL = 300 // 1 seconds
        private readonly BLOCKED_THRESHOLD = 150 // mg above baseline when blocked
        private readonly MIN_THROTTLE_FOR_MOTION = 20; // Minimum throttle to expect motion
        constructor() {
        }
        // set Active (true/false) each time the motor speed is above the minimal speed
        public updateThrottle(throttle: number){ 
            if (Math.abs(throttle) < this.MIN_THROTTLE_FOR_MOTION) {
                this.isActive = false;
            // start the acceleration recording 
            } else {
                if (!this.isActive) {  
                    // Reset all samples to -1
                    for (let i = 0; i < this.MAX_SAMPLES; i++) {
                        this.samples[i] = -1
                     }
                    this.bufferIndex = 0
                    this.lastCheck = input.runningTime()
                    this.isActive = true;
                }
            }
        }
        public setOnBlockedCallback(callback: () => void): void {
            this.onBlockedCallback = callback
        }
        public setOnMovingCallback(callback: () => void): void {
            this.onMovingCallback = callback
        }
        // collects an acceleration sample in each forever loop execution 
        public update(): void {
            if (!this.isActive) return
            const currentTime = input.runningTime()
            // Get acceleration magnitude
            const acc_x = input.acceleration(Dimension.X)
            const acc_y = input.acceleration(Dimension.Y)
            const acc_z = input.acceleration(Dimension.Z)
            const magnitude = Math.sqrt(acc_x * acc_x + acc_z * acc_z )
            // Use circular buffer
            this.samples[this.bufferIndex] = magnitude
            this.bufferIndex = (this.bufferIndex + 1) % this.MAX_SAMPLES
            logger.log(`instant Motion: ` + magnitude)
            // Check for blocked state periodically
            // it could be a better idea to get this out of the main loop, as a scheduled task
            if (currentTime - this.lastCheck >= this.CHECK_INTERVAL) {
                this.checkBlocked()
                this.lastCheck = currentTime
            }
        }

        private checkBlocked(): void {
            // Calculate average acceleration over the samples since the motor has started
            let sum = 0
            let validSamples = 0
            for (let i = 0; i < this.MAX_SAMPLES; i++) {
                if (this.samples[i] >= 0) { // Only count valid samples
                    sum += this.samples[i]
                    validSamples++
                }
            }
            if (validSamples < 5) return // Need enough valid samples
            this.motionIntensity = sum / validSamples // we should do Minus substract the gyro noise
            logger.log(`Average Motion: ${Math.round(this.motionIntensity)}mg`)
            // Check if blocked: motor throttle is high, but motion intensity is low
            if (this.motionIntensity < this.BLOCKED_THRESHOLD) {
                logger.log(`Robot blocked! Motion: ${Math.round(this.motionIntensity)}mg`)
                if (this.onBlockedCallback)
                    this.onBlockedCallback()
            }
            // Robot is moving
            else {
                if (this.onMovingCallback)
                    this.onMovingCallback()
            }
        }
    }

}
