// tests go here; this will not be compiled when this package is used as an extension.
namespace test_cybertruckjs {
    export function testGetDistance() {
        let ballFar = new vision_ns.VisualObject()
        ballFar.setCoordinates(vision_ns.HUSKY_SCREEN_ORIGIN_X, 10, 20, 20)
        ballFar.kind = vision_ns.ObjectKind.Ball;
        logger.log(`ballFar ${ballFar.toString()}`)
        logger.log(`ballFar d: ${ballFar.getDistanceInPixels()}`)
        logger.log(`ballFar a: ${ballFar.getAngleDegrees()}`)
        logger.log(`ballFar s:${ballFar.getScreenSide()}`)
        let ballNear = new vision_ns.VisualObject()
        ballNear.setCoordinates(vision_ns.HUSKY_SCREEN_ORIGIN_X, vision_ns.HUSKY_SCREEN_ORIGIN_Y - 20, 20, 20)
        ballNear.kind = vision_ns.ObjectKind.Ball;
        logger.log(`ballNear ${ballNear.toString()}`)
        logger.log(`ballNear d:${ballNear.getDistanceInPixels()}`)
        logger.log(`ballNear a:${ballNear.getAngleDegrees()}`)

        let ballIn = new vision_ns.VisualObject()
        ballIn.setCoordinates(vision_ns.HUSKY_SCREEN_ORIGIN_X, vision_ns.HUSKY_SCREEN_ORIGIN_Y + 20, 20, 20)
        ballIn.kind = vision_ns.ObjectKind.Ball;
        logger.log(`ballIn ${ballIn.toString()}`)
        logger.log(`ballIn d:${ballIn.getDistanceInPixels()}`)
        logger.log(`ballIn a:${ballIn.getAngleDegrees()}`)

        let ballLeft = new vision_ns.VisualObject()
        ballLeft.setCoordinates(vision_ns.HUSKY_SCREEN_ORIGIN_X - 80, vision_ns.HUSKY_SCREEN_CENTER_Y - 50, 20, 20)
        ballLeft.kind = vision_ns.ObjectKind.Ball;
        logger.log(`ballLeft ${ballLeft.toString()}`)
        logger.log(`ballLeft d:${ballLeft.getDistanceInPixels()}`)
        logger.log(`ballLeft s:${ballLeft.getScreenSide()}`)
        logger.log(`ballLeft a:${ballLeft.getAngleDegrees()}`)

        let ballRight = new vision_ns.VisualObject()
        ballRight.setCoordinates(vision_ns.HUSKY_SCREEN_ORIGIN_X + 40, vision_ns.HUSKY_SCREEN_CENTER_Y - 50, 20, 20)
        ballRight.kind = vision_ns.ObjectKind.Ball;
        logger.log(`ballRight ${ballRight.toString()}`)
        logger.log(`ballRight d:${ballRight.getDistanceInPixels()}`)
        logger.log(`ballRight s:${ballRight.getScreenSide()}`)
        logger.log(`ballRight a:${ballRight.getAngleDegrees()}`)

        let vision_test = new vision_ns.VisionProcessor(protocolAlgorithm.ALGORITHM_COLOR_RECOGNITION, vision_ns.ObjectKind.Ball);
        vision_test.balls.push(ballFar);
        vision_test.balls.push(ballNear);
        vision_test.balls.push(ballIn);
        vision_test.balls.push(ballLeft);
        vision_test.balls.push(ballRight);
        let b = vision_test.getClosestBall();
        console.log(`Closest ball ${b.toString()}`)
        console.log(`Closest ball ${b.getDistanceInPixels()}`)
        
        return true
    }
    

    /**
     * Example usage and test function
     */
    function testAdvancedPID(): void {
        logger.log("=== PID Controller Test ===");
        // Create PID with output limits
        const pid = new pid_ns.PID(1.0, 0.1, 0.05, 100, {
            outputLimits: [-50, 50],
            sampleTime: 10,
            proportionalOnMeasurement: false
        });

        // Simulate a simple system
        let processVariable = 0;
        const systemGain = 0.8;
        const systemDelay = 0.9;

        logger.log("Starting PID control simulation...");
        for (let i = 0; i < 100; i++) {
            // Get PID output
            const controlOutput = pid.update(processVariable);
            // Simulate system response
            if (controlOutput != null) {
                processVariable = processVariable * systemDelay + controlOutput * systemGain * 0.01;
            }
            // Log every 10 iterations
            if (i % 10 === 0) {
                const state = pid.getState();
                logger.log(`Step ${i}: PV=${processVariable}, Output=${controlOutput}, Error=${state.error}`);
            }
            // Break if converged
            if (Math.abs(pid.setpoint - processVariable) < 0.5) {
                logger.log(`Converged at step ${i}`);
                break;
            }
        }
        const finalState = pid.getState();
        logger.log(`Final state: PV=${processVariable}, Error=${finalState.error}`);
        logger.log("=== Test Complete ===");
    }
}