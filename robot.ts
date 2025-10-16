enum RobotState {
    stopped,       //Game.State == Stopped
    waiting,       //Game.State == Stopped, Game.Mode == Slave
    searchingBalls,//Game.State == Started
    trackingBall,  //Game.State == Started
    searchingHome, //Game.State == Started
    goingHome,     //Game.State == Started
    unblocking,    //Game.State == Started
    atHome // when at home, send status  <name>:<timer> mission:safe_place_reached, wait 5s then resume
}

const GRAB_SPEED = -70
const WAIT_BEFORE_SPINNING_WHEN_LOST_TRACKING_BALL_MS = 200
const MUTE_MUSIC = true

class Robot {
    state: number
    previousState: number
    timeWhenLostBall: number = 0;
    lastBallSeenOnTheLeft: boolean = false;
    lastUnblockingAttempt: number = 0;
    grabbing: boolean = false;
    constructor() {
        this.state = RobotState.waiting
    }

    public setState(state: number) {
        if (this.state != state) {
            this.state = state
            updateMusic(this.state)
            logger.log("Robot State changed : " + this.state)
            switch (this.state) {
                case RobotState.stopped:
                    MotorController.setMotor(SPEED_MOTOR, 0)
                    ServoController.setServo(DIRECTION_SERVO, 0)
                    this.setGrabbing(false)
                    break;
                case RobotState.atHome:
                    UTBBot.newBotStatus(UTBBotCode.BotStatus.MISSION_COMPLETED)
                    MotorController.setMotor(SPEED_MOTOR, 0)
                    ServoController.setServo(DIRECTION_SERVO, 0)
                    this.setGrabbing(false)
                    break;
                case RobotState.unblocking:
                    this.setGrabbing(false);
                    break;
                case RobotState.trackingBall:
                case RobotState.searchingBalls:
                    this.setGrabbing(true)
                    if (HUSKY_WIRED) {
                        vision.setMode(protocolAlgorithm.ALGORITHM_COLOR_RECOGNITION)
                        vision.setKind(vision_ns.ObjectKind.Ball)
                    }
                    break;
                case RobotState.waiting:
                case RobotState.searchingHome:
                case RobotState.goingHome:
                    this.setGrabbing(false)
                    if (HUSKY_WIRED) {
                        vision.setMode(protocolAlgorithm.ALGORITHM_TAG_RECOGNITION)
                        vision.setKind(vision_ns.ObjectKind.QRcode)
                    }
                    break
                default:
                    break
            }
        }
    }

    private setGrabbing(grab: boolean) {
        if (this.grabbing != grab) {
            this.grabbing = grab
            if (this.grabbing) {
                MotorController.setMotor(GRABBER_MOTOR, GRAB_SPEED) //grab
                if (EXEC_MODE == ExecMode.MakeCode)
                    servos.P2.run(100) // for visual simulation
            }
            else {
                MotorController.setMotor(GRABBER_MOTOR, 0) //stop grabbing
                if (EXEC_MODE == ExecMode.MakeCode)
                    servos.P2.run(0) // for visual simulation
            }
        }
    }

    // Externel explicit state changes
    public doStart() {
        logger.log("Game started at " + bricksGame.startTime + " . Starting collecting balls...")
        this.setState(RobotState.searchingBalls)
    }
    public doStop() {
        logger.log("Game Stopped. Stopping collecting balls.")
        this.setState(RobotState.stopped)
    }
    public askGoingHome() {
        logger.log("Should I go home ?")
        //we can decide to ignore or not the instruction from Game controller
        this.doGoHome();
    }
    public doGoHome() {
        logger.log("Going home. If location unknown, look for it.")
        // no more balls, or time is over, or acknolewdging danger mode
        this.setState(RobotState.searchingHome)
        
    }

    // try to get out of a blocked state
    public handleBlockedState(): void {
        if (this.state != RobotState.unblocking) {
            this.previousState = this.state;
            this.setState(RobotState.unblocking);
        }
    }
    // Robot is unblocked
    public handleMovingHeartbeat(): void {
        if (this.state == RobotState.unblocking)
            this.setState(this.previousState);
    }

    // Autonomous decision making
    public updateObjective() {
        //  Based on input signals, current position, object recgnition and game instructions
        //  determine the next action and next state
        // 
        //  Condition 1 : get closer to the home before the end of the game
        //  (TO DO : consider distance_to_home)
        //logger.log("Remaining time " + bricksGame.remainingTime())
        if ((bricksGame.remainingTime() < DELAY_TO_GO_HOME)
            &&((this.state == RobotState.searchingBalls)
            || (this.state == RobotState.trackingBall))) {
            this.doGoHome()
        }
        
        // While waiting for the game to start
        // we could also spin left/right and look at the balls and QR Codes
        if (this.state == RobotState.searchingBalls) {
            if (vision.balls.length > 0) {
                logger.log("Found Balls on screen : " + vision.balls.length)
                // wait a bit more for the most centered ball to be "in-axis" ???
                this.setState(RobotState.trackingBall)
            }
            else {
                logger.log("Keep searching balls...")
                // TO DO we need to spin randomly or to head to the latest know ball location
            }
        }
        if (this.state == RobotState.trackingBall) {
            if (vision.balls.length == 0) {
                logger.log("All balls LOST or COLLECTED. Back to searching...")
                this.setState(RobotState.searchingBalls)
                this.timeWhenLostBall = control.millis()
            }
            else {
                for (let i = 0; i < vision.balls.length; i++) {
                    if (vision.balls[i].getAngleFromX() < 0)
                        this.lastBallSeenOnTheLeft = true
                    else
                        this.lastBallSeenOnTheLeft = false
                }
            }
        }
        // Let's find the base zone
        if (this.state == RobotState.searchingHome) {
            if (vision.getQRCode(vision_ns.QRcodeId.Home) != null) {
                logger.log("QRCode for Home found !");
                this.setState(RobotState.goingHome);
            }
        }
        // while heading to the Home Tag, stop when arrived close enough
        if (this.state == RobotState.goingHome) {
            let vo = vision.getQRCode(vision_ns.QRcodeId.Home)
            if (vo != null) {
                if (vo.getDistanceInCm() < 30) // visual size of a QR code just in front of the Bot
                    this.setState(RobotState.atHome);
            }
            else
                // Home Tag was lost
                this.setState(RobotState.searchingHome);
        }
    }

    // Motion decision
    // Based on the Robot State, Goal and Environment
    // Determine the next waypoint to reach, and linear and angular velocities to reach it
    // if tracking a VisualObject : compute the angle compared to screen center
    // if heading blindly to a direction : compute the angle compared to compass orientation
    // if explicit movement (spinRight, spinLeft, ...) : use the compass or a timer (cf FreeMove)
    public computeNextWaypoint() {
        switch (this.state) {
            case RobotState.stopped:
            case RobotState.atHome:
                motion.setWaypoint(0, 0)
                break
            case RobotState.searchingBalls:
                // wait 200ms when losing the ball before spinning around
                if (this.timeWhenLostBall + WAIT_BEFORE_SPINNING_WHEN_LOST_TRACKING_BALL_MS < control.millis()) {
                    if (this.lastBallSeenOnTheLeft) {
                        motion.setWaypoint(MAX_SPEED, -60)
                    } else {
                        motion.setWaypoint(MAX_SPEED, 60)
                    }
                } else {
                    motion.setWaypoint(0, 0)
                }
                break
            
            case RobotState.unblocking:
                // try the next possible move to get out of the blocked state
                this.lastUnblockingAttempt++;
                this.lastUnblockingAttempt = this.lastUnblockingAttempt % motion.clearanceMovesSequences.length
                motion.doFreeMoveSequence(motion.clearanceMovesSequences[this.lastUnblockingAttempt])
                this.setState(this.previousState);
                break;

            case RobotState.searchingHome:
                /*
                // waypoint = approximate direction of the base camp
                if (arena.isPositionReliable()) {
                    const distanceToBase = arena.getDistanceToBase();
                    const bearingToBase = arena.getBearingToBase();
                    const robotPose = arenaMap.getRobotPose();
                    // Imperative mode
                    // Calculate turn angle needed
                    let turnAngle = bearingToBase - robotPose.heading;
                    if (Math.abs(turnAngle) > 10)
                        // Normalize angle to -180 to 180
                        while (turnAngle > 180) turnAngle -= 360;
                        while (turnAngle < -180) turnAngle += 360;
                        motion.spinAround(turnAngle);
                        //motion.setWaypoint(distanceToBase, turnAngle)
                        logger.log(`Base: ${Math.round(distanceToBase)}cm at ${Math.round(bearingToBase)}°`);
                        // Auto controlled mode
                        //motion.setWaypoint(distanceToBase, bearingToBase)
                    }
                } else {
                    logger.log("Position uncertain - looking for QR codes...");
                    //motion.spinAround(10)
                }
                */
                break
            case RobotState.trackingBall:
                let closestBall = vision.balls[0];
                for (let i = 1; i < vision.balls.length; i++) {
                    if (vision.balls[i].getSizeInPixels() > closestBall.getSizeInPixels()) {
                        closestBall = vision.balls[i];
                    }
                }
                const ballAngle = closestBall.getAngleFromX()
                let steeringAngle = ballAngle * 1.5
                if (Math.abs(steeringAngle) <= 10) {
                    steeringAngle = ballAngle
                } else if (Math.abs(steeringAngle) > 10 && closestBall.y > 120) {
                    steeringAngle = ballAngle * 3
                }
                motion.setWaypoint(MAX_SPEED, steeringAngle)
                logger.log("Closest ball at distance ~" + closestBall.getDistanceInCm() + "cm, angle=" + closestBall.getAngleFromX() + " steering angle " + steeringAngle)
                break
            case RobotState.goingHome:
                // waypoint = QR code on Camera
                let tag = vision.getQRCode(vision_ns.QRcodeId.Home)
                if (tag != null) {
                    // Reduce the speed when approaching the Home
                    let throttle = MAX_SPEED
                    if (tag.getDistanceInCm() < 60){
                        throttle = MAX_SPEED / 2
                    }
                    // Increase the angle  when approaching the tag
                    const tagAngle = tag.getAngleFromX()
                    let steeringAngle = tagAngle * 1.5
                    if (Math.abs(steeringAngle) <= 10) {
                        steeringAngle = tagAngle
                    } else if (Math.abs(steeringAngle) > 10 && tag.getDistanceInCm() < 60) {
                        steeringAngle = tagAngle * 3
                    }
                    motion.setWaypoint(throttle, steeringAngle)
                    logger.log("Going to Home at distance ~" + tag.getDistanceInCm() + "cm, angle=" + tag.getAngleFromX() + " steering angle " + steeringAngle)
                }
                break
            default:
                break
        }
    }

}

function updateMusic(state: number) {
    music.stopAllSounds()
    if (MUTE_MUSIC) return
    switch (state) {
        case RobotState.searchingBalls:
            // Active searching sound
            music.beginMelody(police, MelodyOptions.ForeverInBackground)
            break
        case RobotState.trackingBall:
            // Focused tracking sound
            music.beginMelody(imperial_march, MelodyOptions.ForeverInBackground)
            break
        case RobotState.searchingHome:
            // Searching for home sound
            music.beginMelody(police, MelodyOptions.ForeverInBackground)
            break
        case RobotState.goingHome:
            // Heading home sound
            music.beginMelody(windows_xp, MelodyOptions.ForeverInBackground)
            break
        case RobotState.unblocking:
            // Backward motion sound
            music.beginMelody(backward, MelodyOptions.ForeverInBackground)
            break
        default:
            break
    }
}
