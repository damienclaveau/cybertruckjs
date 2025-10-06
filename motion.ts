namespace motion {

    enum MotionDirection {
        Idle,
        Forward,
        Backward,
        Spinning
    }

    export class Waypoint {
        distance: number  //  mm
        angle: number // radians
        constructor(distance: number, angle: number) {
            this.distance = distance
            this.angle = angle
        }
    }

    let waypoint = new Waypoint(0,0)
    // 
    export function setWaypoint(distance: number, angle: number){
        waypoint.distance = distance
        waypoint.angle = angle
    }
    
    /*
    ServoController.setServo(DIRECTION_SERVO, -45) //turn right
    ServoController.setServo(DIRECTION_SERVO, 0) //straight
    ServoController.setServo(DIRECTION_SERVO, 45) //turn left
    MotorController.setMotor(SPEED_MOTOR, -100) //backward max speed
    MotorController.setMotor(SPEED_MOTOR, 100) //forward max speed
    */
    export function goToWaypoint() {
        //logger.log("Going to Waypoint d="+waypoint.distance+" , a="+waypoint.angle)
        //  Drive servo and motor with PWM according to updated linear and angular velocities
        //  Set the steering servo position to aim to the waypoint
        let steering = 0
        //  TO DO : to be computed with PID, cf Martin's code
        if (EXEC_MODE == ExecMode.MakeCode) {// for simulation mode only
            servos.P0.setAngle(steering)
        } else {
            ServoController.setServo(DIRECTION_SERVO, steering)
        }

        //  Set the servo throttle power depending on the remaining distance to the waypoint
        let speed = 0
        // TODO : maybe a PID or exponential formula needed here
        if (waypoint.distance > 60)
            speed = 100
        else if (waypoint.distance > 0)
            speed = 50
        if (EXEC_MODE == ExecMode.MakeCode) {// for simulation mode only
            servos.P1.run(speed)
        } else {
            MotorController.setMotor(SPEED_MOTOR, speed)
        }
    }

}
