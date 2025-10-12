enum RobotState {
    stopped,       //Game.State == Stopped
    waiting,       //Game.State == Stopped, Game.Mode == Slave
    searchingBalls,//Game.State == Started
    trackingBall,  //Game.State == Started
    searchingHome, //Game.State == Started
    goingHome,     //Game.State == Started
    atHome // when at home, send status  <name>:<timer> mission:safe_place_reached, wait 5s then resume
}


class Robot {
    state: number
    //waypoint: motion.Waypoint
    constructor() {
        this.state = RobotState.waiting
    }

    public setState(state: number) {
        if (this.state != state) {
            this.state = state
            logger.log("Robot State changed : " + this.state)
            switch (this.state) {
                case RobotState.atHome:
                case RobotState.stopped:
                    break;                
                case RobotState.trackingBall:
                case RobotState.searchingBalls:
                    if (HUSKY_WIRED) {
                        vision.setMode(protocolAlgorithm.ALGORITHM_COLOR_RECOGNITION)
                        vision.setKind(vision_ns.ObjectKind.Ball)
                    }
                    break;
                case RobotState.waiting:
                case RobotState.searchingHome:
                case RobotState.goingHome:
                    if (HUSKY_WIRED) {
                        vision.setMode(protocolAlgorithm.ALGORITHM_TAG_RECOGNITION)
                        vision.setKind(vision_ns.ObjectKind.QRcode)
                    }
                    break
                case RobotState.atHome:
                    UTBBot.newBotStatus(UTBBotCode.BotStatus.MISSION_COMPLETED)
                    break
                default:
                    break
            }
        }
    }

    // Externel explicit state changes
    public doStart() {
        logger.log("Game started at " + bricksGame.startTime + " . Starting collecting balls...")
        MotorController.setMotor(GRABBER_MOTOR, 50) //grab
        if (EXEC_MODE == ExecMode.MakeCode)
            servos.P2.run(100) // for visual simulation
        this.setState(RobotState.searchingBalls)
    }
    public doStop() {
        logger.log("Game Stopped. Stopping collecting balls.")
        MotorController.setMotor(GRABBER_MOTOR, 0) //stop grabbing
        if (EXEC_MODE==ExecMode.MakeCode)
            servos.P2.run(0) // for visual simulation
        this.setState(RobotState.stopped)
    }
    public askGoingHome() {
        logger.log("Should I go home ?")
        //we can decide to ignore or not the instruction from Game controller
    }
    public doGoHome() {
        logger.log("Going home. If location unknown, look for it.")
        // no more balls, or time is over, or acknolewdging danger mode
        this.setState(RobotState.searchingHome)
        
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
                
            logger.log("########### GO HOME ###################")
            this.doGoHome()
        }
        
        // While waiting for the game to start
        // we could also spin left/right and look at the balls and QR Codes
        if (this.state == RobotState.searchingBalls) {
            if (vision.balls.length > 0) {
                logger.log("Found Balls on screen : " + vision.balls.length)
                this.setState(RobotState.trackingBall)
                // TO DO define waypoint to the closest or the most centered ball
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
            }
            else {
                let closestBall = vision.balls[0];
                for (let i = 1; i < vision.balls.length; i++) {
                    if (vision.balls[i].getSizeInPixels() > closestBall.getSizeInPixels()) {
                        closestBall = vision.balls[i];
                    }
                }
                motion.setWaypoint(100, closestBall.getAngleFromX())
                logger.log("Closest ball at distance ~" + closestBall.getDistanceInCm() + "cm, angle=" + closestBall.getAngleFromX())
            }
        }
        // Let's find the base zone
        if (this.state == RobotState.searchingHome) {
            if (vision.getQRCode(vision_ns.QRcodeId.Home) != null) {
                logger.log("QRCode for Home found !");
                this.setState(RobotState.goingHome);
            }
        }

        //  Condition 2 : ...

        //  Condition 3 : ...

    }

    // Motion decision
    // Based on the Robot State, Goal and Environment
    // Determine the next waypoint to reach, and linear and angular velocities to reach it
    // if tracking a VisualObject : compute the angle compared to screen center
    // if heading blindly to a direction : compute the angle compared to compass orientation
    // if explicit movement (spinRight, spinLeft, ...) : use the compass too
    public computeNextWaypoint() {
        switch (this.state) {
            case RobotState.stopped:
            case RobotState.atHome:
                motion.setWaypoint(0, 0)
                break
            case RobotState.searchingBalls:
                // we are likely spinning around
                motion.setWaypoint(100, -90)
                break
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
                // already done in updateObjective
                break
            case RobotState.goingHome:
                // waypoint = QR code on Camera
                let qr = vision.getQRCode(vision_ns.QRcodeId.Home)
                if (qr != null) {
                    motion.setWaypoint(qr.getDistanceInCm(), qr.getAngle())
                }
                break
            default:
                break
        }
    }
}