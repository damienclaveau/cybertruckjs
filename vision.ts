namespace vision_ns {

    const HUSKY_SCREEN_WIDTH = 320; // pixels
    const HUSKY_SCREEN_HEIGHT = 240; // pixels
    const HUSKY_SCREEN_CENTER_X = HUSKY_SCREEN_WIDTH / 2;
    const HUSKY_SCREEN_CENTER_Y = HUSKY_SCREEN_HEIGHT / 2;
    const HUSKY_SCREEN_TOLERANCE_X = 10; // pixels

    const BALL_REFERENCE_DISTANCE = 50; // (cm)
    const BALL_REFERENCE_FRAMESIZE = 30; // (pixels) width and height of a ball frame at 50 cm distance
    const BALL_DISTANCE_RATIO = BALL_REFERENCE_DISTANCE / BALL_REFERENCE_FRAMESIZE;

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
            return `kind: ${this.kind} id: ${this.x} x:${this.x} y:${this.y} w:(${this.w} h:${this.h}`;
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

        // Compute distance of the TrackedObject based on the visual size ratio
        getDistance() {
            const size = Math.sqrt(this.w ** 2 + this.h ** 2); // frame diagonal
            return (BALL_REFERENCE_FRAMESIZE * BALL_REFERENCE_DISTANCE) / size;
        }

        // Compute coordinates of the TrackedObject relative to the robot position (origin)
        getAngle() {
            const distance = this.getDistance();
            const deltaX = Math.abs(this.x - HUSKY_SCREEN_CENTER_X);
            const deltaY = Math.sqrt(distance ** 2 - deltaX ** 2);
            // Angle between y front-axis and the ball projected coordinates(dx,dy)
            return Math.atan2(deltaX, deltaY);
        }
    }

    export function getClosestBall(): VisualObject{
        return null
    }

    export function getQRCode(code: QRcodeId): VisualObject {
        return null
    }


    // Vision Processor Class
    export class VisionProcessor {
        public mode: number
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

        setMode(mode: number) {
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

        refreshForced(mode: number, kind: number) {
            // Change temporarily the mode and the kind to refresh all objects once
            const saveMode = this.mode;
            const saveKind = this.kind;
            this.setMode(mode);
            this.setKind(kind);
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
            if (this.verbose) { logger.log(`Objects detected : ${nbFrames}`); }
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
    }

}
