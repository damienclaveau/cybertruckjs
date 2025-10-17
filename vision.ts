namespace vision_ns {

    export const HUSKY_SCREEN_WIDTH = 320; // pixels
    export const HUSKY_SCREEN_HEIGHT = 240; // pixels
    export const HUSKY_SCREEN_CENTER_X = HUSKY_SCREEN_WIDTH / 2;
    export const HUSKY_SCREEN_CENTER_Y = HUSKY_SCREEN_HEIGHT / 2;
    export const HUSKY_SCREEN_TOLERANCE_X = 10; // pixels
    // Horizontal frontier representing the frontier between FrontSide and Inside the Bot
    // This is compensating the down angle of the camera
    export const HUSKY_SCREEN_ORIGIN_X = HUSKY_SCREEN_CENTER_X;
    export const HUSKY_SCREEN_ORIGIN_Y = HUSKY_SCREEN_HEIGHT * 0.8;

    export const BALL_REFERENCE_DISTANCE = 50; // (cm)
    export const BALL_REFERENCE_FRAMESIZE = 30; // (pixels) width and height of a ball frame at 50 cm distance
    export const BALL_DISTANCE_RATIO = BALL_REFERENCE_DISTANCE / BALL_REFERENCE_FRAMESIZE;
    // for Tags, the framesize seems reliable
    const TAG_VISUAL_RATIO_1 = { size: 45, distance: 110 };
    const TAG_VISUAL_RATIO_2 = { size: 155, distance: 30 };
    // Calculate proportionality constants from the visual ratios
    const TAG_PROPORTIONALITY_CONSTANT = (TAG_VISUAL_RATIO_1.size * TAG_VISUAL_RATIO_1.distance + TAG_VISUAL_RATIO_2.size * TAG_VISUAL_RATIO_2.distance) / 2;

    // Screen Side Class
    export enum ScreenSide {
        Left,
        Right,
        Middle
    }

    // QR Codes Configuration
    const QR_CODES = [
        { code: "id300", cardinal: "East", husky_learned_id: 1 },
        { code: "id301", cardinal: "South", husky_learned_id: 2 },
        { code: "id302", cardinal: "West", husky_learned_id: 3 },
        { code: "id303", cardinal: "North", husky_learned_id: 4 },
        { code: "id407", cardinal: "Base", husky_learned_id: 5 }
    ];

    // QR Code ID as recognized by Husky TagRecognition
    export class QRcodeId {
        static East = 1;
        static South = 2;
        static West = 3;
        static North = 4;
        static Home = 5;
    }

    // Object Color ID as recognized by Husky ColorRecognition
    export class ObjectColorID {
        static Red = 1; // a ball
        static Yellow = 2; // another robot
    }

    // Object Class ID as recognized by Husky ObjectClassification
    export class ObjectClassID {
        static Unknown = 0;
        static Ball = 1;
        static Robot = 2;
        static Tag = 3;
    }

    // Object Kind
    export enum ObjectKind {
        Unknown,
        Ball,
        Robot,
        QRcode
    }

    // Visual Object Class
    export class VisualObject {
        public x: number = -1
        public y: number = -1
        public w: number = -1
        public h: number = -1
        public id: number = -1 // ID as returned by Huskylens 
        public kind: ObjectKind = ObjectKind.Unknown
        public last_seen: number = -1
        public is_tracked: boolean = false
        constructor() {
        }

        setCoordinates(x: number, y: number, w: number, h: number) {
            // Set the object's coordinates and dimensions. Update LastSeen time.
            this.x = x;
            this.y = y;
            this.w = w;
            this.h = h;
            this.last_seen = input.runningTime();
        }

        reset() {
            // Reset the object's coordinates and dimensions.
            this.setCoordinates(0, 0, 0, 0);
            this.last_seen = 0;
        }

        toString() {
            // Display the object's details.
            return `kind: ${this.kind} id: ${this.x} x:${this.x} y:${this.y} w:${this.w} h:${this.h}`;
        }

        // Get side of the TrackedObject relative to the robot direction
        getScreenSide() {
            if (this.x > (HUSKY_SCREEN_CENTER_X + HUSKY_SCREEN_TOLERANCE_X)) {
                return ScreenSide.Right;
            } else if (this.x < (HUSKY_SCREEN_CENTER_X - HUSKY_SCREEN_TOLERANCE_X)) {
                return ScreenSide.Left;
            } else {
                return ScreenSide.Middle;
            }
        }

        // Compute distance of an object based on visual size ratio
        // good for large objects like QR Codes ?
        getDistanceBySize() {
            const size = Math.sqrt(this.w ** 2 + this.h ** 2); // frame diagonal
            switch (this.kind) {
                case ObjectKind.Ball: return (BALL_REFERENCE_FRAMESIZE * BALL_REFERENCE_DISTANCE) / size;
                case ObjectKind.QRcode: return TAG_PROPORTIONALITY_CONSTANT / size;
                default: return Infinity;
            }
        }

        getSizeInPixels() {
            return Math.sqrt(this.w ** 2 + this.h ** 2); // frame diagonal
        }

        // Calculate distance (radius) from origin (at middle bottom of screen, think Radar quadrant)
        // good for ponctual objects like Balls ?
        // Origin: x = HUSKY_SCREEN_CENTER_X, y = HUSKY_SCREEN_HEIGHT
        getDistanceInPixels() {
            let deltaX = Math.abs(this.x - HUSKY_SCREEN_ORIGIN_X);
            let deltaY = this.y - HUSKY_SCREEN_ORIGIN_Y;
            // in this particular mode deltaY < 0 means inside or behind the robot frontside
            // and we don't plan to catch balls backward for the moment
            if (deltaY > 0)
                deltaY = Infinity;
            else
                deltaY = Math.abs(deltaY);
            return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        }

        // Convert visual distance to real distance
        getDistanceInCm() {
            switch (this.kind) {
                case ObjectKind.Ball: // object ponctuel, on se refere au decalage par rapport au centre
                    const deltaX = this.x - HUSKY_SCREEN_ORIGIN_X;
                    const deltaY = this.y - HUSKY_SCREEN_ORIGIN_Y;
                    return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                case ObjectKind.QRcode: // objet rectangulaire, la size est relevant
                    return TAG_PROPORTIONALITY_CONSTANT / Math.sqrt(this.w * this.w + this.h * this.h);
                default:
                    return -1;
            }
        }

        // Compute distance of a Ball based on Y position on screen
        // Y=0 (top) = 100cm, Y=HUSKY_SCREEN_HEIGHT (bottom) = 20cm
        getDistanceByHeight() {
            // Linear interpolation: distance decreases as Y increases
            // At y=0 (top): distance = 100cm
            // At y=HUSKY_SCREEN_HEIGHT (bottom): distance = 20cm
            const maxDistance = 100; // cm at top of screen
            const zeroDistance = 0; // cm at HUSKY_SCREEN_ORIGIN_Y
            const minDistance = -20;  // cm at bottom of screen

            // Normalize Y position to 0-1 range
            const normalizedY = this.y / HUSKY_SCREEN_HEIGHT;

            // Linear interpolation between max and min distance
            const distance = maxDistance - (normalizedY * (maxDistance - minDistance));

            return Math.max(minDistance, Math.min(maxDistance, distance));
        }

        getAngleFromX() {
            const deltaX = this.x;
            return (deltaX * 52 / HUSKY_SCREEN_WIDTH) - 26;
        }

        // Compute coordinates of the TrackedObject relative to the robot position (origin)
        getAngle() {
            const distance = this.getDistanceByHeight();
            const deltaX = Math.abs(this.x - HUSKY_SCREEN_CENTER_X);
            const deltaY = Math.sqrt(distance ** 2 - deltaX ** 2);
            // Angle between y front-axis and the ball projected coordinates(dx,dy)
            return Math.atan2(deltaX, deltaY);
        }

        // Get angle in degrees with proper left/right sign convention
        // Returns: [-180..0] for left side, [0..180] for right side
        getAngleDegrees() {
            const deltaX = this.x - HUSKY_SCREEN_CENTER_X;  // Preserve sign for left/right
            const distance = this.getDistanceByHeight();
            const deltaY = Math.sqrt(distance ** 2 - (deltaX * deltaX));
            // Use signed deltaX to get proper left/right direction
            const angleRadians = Math.atan2(deltaX, deltaY);
            return angleRadians * 180 / Math.PI;
        }
    }


    // Vision Processor Class
    export class VisionProcessor {
        public mode: protocolAlgorithm
        public kind: number
        public tracked: VisualObject
        public tags: VisualObject[] = [];
        public balls: VisualObject[] = [];
        public bots: VisualObject[] = [];
        public verbose: boolean = true
        constructor(mode = protocolAlgorithm.ALGORITHM_TAG_RECOGNITION, kind = ObjectKind.QRcode) {
            this.mode = mode;
            this.kind = kind;
            this.tracked = new VisualObject();
            this.tags = [];
            this.balls = [];
            this.bots = [];
        }

        setMode(mode: protocolAlgorithm) {
            if (this.mode !== mode) {
                this.mode = mode;
                huskylens.initMode(this.mode);
                if (this.verbose) { logger.log(`Mode set to: ${this.mode}`); }
            }
        }

        setKind(kind: number) {
            if (this.kind !== kind) {
                this.kind = kind;
                if (this.verbose) { logger.log(`Kind set to: ${this.kind}`); }
            }
        }

        init() {
            huskylens.initI2c();
            huskylens.clearOSD;
            huskylens.initMode(this.mode);
        }

        refreshForced(mode: protocolAlgorithm, kind: number) {
            // Change temporarily the mode and the kind to refresh all objects once
            const saveMode = this.mode;
            const saveKind = this.kind;
            this.setMode(mode);
            this.setKind(kind);
            pause(100);
            this.refresh();
            this.setMode(saveMode);
            this.setKind(saveKind);
        }

        // Capture a new video frame and analyze it : is there 1 ball, no ball, a Tag, an obstacle or nothing ?
        refresh() {
            // Refresh the VisionProcessor.
            huskylens.request();
            //if (this.verbose) { logger.debug(`Husky (mode  ${this.mode},  ${huskylens.getIds()} known IDs)`) }
            if (this.mode === protocolAlgorithm.ALGORITHM_OBJECT_TRACKING) {
                this.processSingleObject();
            }
            if ((this.mode === protocolAlgorithm.ALGORITHM_TAG_RECOGNITION)
                || (this.mode === protocolAlgorithm.ALGORITHM_COLOR_RECOGNITION)
                || (this.mode === protocolAlgorithm.ALGORITHM_OBJECT_TRACKING)) {
                this.processAllObjects()
            }
        }

        processSingleObject() {
            // Process a single object in tracking mode.
            // Frame (== Block type) appears in screen ?
            this.tracked.is_tracked = huskylens.isAppear_s(HUSKYLENSResultType_t.HUSKYLENSResultBlock)
            if (this.tracked.is_tracked) {
                // check if the tracked object is a learnt object 
                if (!huskylens.isLearned(this.kind)) {
                    if (this.verbose) { logger.log("Tracking UNKNOWN object") }
                }
                const objectId = this.kind; // always one single TrackedObject in this mode
                this.tracked.setCoordinates(
                    huskylens.readeBox(objectId, Content1.xCenter),
                    huskylens.readeBox(objectId, Content1.yCenter),
                    huskylens.readeBox(objectId, Content1.width),
                    huskylens.readeBox(objectId, Content1.height)
                );
                if (this.verbose) { logger.log("Tracked Object updated : " + this.tracked.toString()) }

            } else {
                // if (input.runningTime() - trackedObject.lastSeen) > OBJECT_LOST_DELAY:
                this.tracked.reset();
                if (this.verbose) { logger.log("Tracked Object Lost") }
            }
        }

        processAllObjects() {
            // Process all objects in recognition mode.
            this.tags = [];
            this.balls = [];
            this.bots = [];
            // for each frame, Update the relative Position of the QR codes
            const nbFrames = huskylens.getBox(HUSKYLENSResultType_t.HUSKYLENSResultBlock);
            if (this.verbose) { if (nbFrames > 0) logger.log(`Objects : ${nbFrames}`); }
            for (let i = 1; i <= nbFrames; i++) {
                const vo = new VisualObject();
                vo.id = huskylens.readBox_ss(i, Content3.ID);
                vo.setCoordinates(
                    huskylens.readBox_ss(i, Content3.xCenter),
                    huskylens.readBox_ss(i, Content3.yCenter),
                    huskylens.readBox_ss(i, Content3.width),
                    huskylens.readBox_ss(i, Content3.height)
                );

                if (this.mode === protocolAlgorithm.ALGORITHM_TAG_RECOGNITION) {
                    vo.kind = ObjectKind.QRcode
                    this.tags.push(vo);
                    if (this.verbose) { logger.log("Tag : " + vo.toString()); }
                }
                if (this.mode === protocolAlgorithm.ALGORITHM_COLOR_RECOGNITION) {
                    if (vo.id === ObjectColorID.Red) {
                        vo.kind = ObjectKind.Ball
                        this.balls.push(vo);
                        if (this.verbose) { logger.log("Ball : " + vo.toString()); }
                    }
                    if (vo.id === ObjectColorID.Yellow) {
                        vo.kind = ObjectKind.Robot
                        this.bots.push(vo);
                        if (this.verbose) { logger.log("Bot : " + vo.toString()); }
                    }

                }
                if (this.mode === protocolAlgorithm.OBJECTCLASSIFICATION) {
                    if (vo.id === ObjectClassID.Ball) {
                        vo.kind = ObjectKind.Ball
                        this.balls.push(vo);
                        if (this.verbose) { logger.log("Ball : " + vo.toString()); }
                    }
                    if (vo.id === ObjectClassID.Robot) {
                        vo.kind = ObjectKind.Robot
                        this.bots.push(vo);
                        if (this.verbose) { logger.log("Bot : " + vo.toString()); }
                    }
                    if (vo.id === ObjectClassID.Tag) {
                        vo.kind = ObjectKind.QRcode
                        this.tags.push(vo);
                        if (this.verbose) { logger.log("Tag : " + vo.toString()); }
                    }

                }
            }
        }

        // Get the Tag by Id
        getQRCode(id: QRcodeId): VisualObject {
            if (this.tags.length === 0) return null;
            for (const tag of this.tags) {
                if (tag.id == id) return tag;
            }
            return null;
        }

        // Get the closest ball that is most in line of sight and nearest
        getClosestBall(): VisualObject | null {
            if (this.balls.length === 0) {
                return null;
            }
            let bestBall: VisualObject | null = null;
            let bestDistance = Infinity;
            for (const ball of this.balls) {
                // Calculate distance (radius) from origin at middle bottom of screen
                // TODO :  Weighted distance vs angle, could be a good idea to Prefer in-axis balls
                const distance = ball.getDistanceInPixels()
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestBall = ball;
                }
            }
            return bestBall;
        }
    }

}
