// Map and Positioning System for Robot Navigation
// Uses QR codes placed at arena corners for triangulation and position estimation

namespace position {
    
    export function updateSensors() {
        //  Update Compass direction, current speed, deviation, commands coming from Bluetooth, ...
        //  TO DO Compute current position with sensor fusion https://github.com/micropython-IMU/micropython-fusion/tree/master
        let compass_heading = input.compassHeading()
        let mag_x = input.magneticForce(Dimension.X)
        let mag_y = input.magneticForce(Dimension.Y)
        let mag_z = input.magneticForce(Dimension.Z)
        let acc_x = input.acceleration(Dimension.X)
        let acc_y = input.acceleration(Dimension.Y)
        let acc_z = input.acceleration(Dimension.Z)
        let acceleration = Math.sqrt(acc_x ** 2 + acc_y ** 2 + acc_z ** 2)
    }

    // re-compute the occupancy grid : QRCodes cardinals, home location, balls clusters, robots
    // approximate the Robot orientation and position
    
    // Arena Configuration
    const ARENA_WIDTH = 130; // cm (260 for the 4 players game)
    const ARENA_HEIGHT = 130; //  
    const BASE_CAMP_X = ARENA_WIDTH; // this is North-East Corner
    const BASE_CAMP_Y = ARENA_HEIGHT; // this is North-East Corner
    // QR Code Positions in Arena (in cm from origin at center)
    interface QRPosition {
        x: number;
        y: number;
        cardinal: string;
        id: number;
    }
    // Robot Position and Orientation
    export class RobotPose {
        public x: number = 0; // cm from arena center
        public y: number = 0; // cm from arena center
        public heading: number = 0; // degrees, 0 = North
        public confidence: number = 0; // 0-100, estimation confidence
        constructor(x: number = 0, y: number = 0, heading: number = 0) {
            this.x = x;
            this.y = y;
            this.heading = heading;
        }
    }
    // Occupancy Grid and Map Class
    export class ArenaMap {
        private qrPositions: QRPosition[] = [];
        private basePosition: QRPosition;
        private robotPose: RobotPose = new RobotPose();
        private lastUpdate: number = 0;
        private occupancyGrid: number[][]; // 0 = free, 1 = occupied, -1 = unknown
        private gridResolution: number = 5; // cm per cell
        private gridWidth: number;
        private gridHeight: number;
        constructor() {
            // Initialize QR code positions at arena corners and wall extremities
            this.initializeQRPositions();
            // Initialize occupancy grid
            this.gridWidth = Math.ceil(ARENA_WIDTH / this.gridResolution);
            this.gridHeight = Math.ceil(ARENA_HEIGHT / this.gridResolution);
            for (let i = 0; i < this.gridHeight; i++) {
                this.occupancyGrid[i] = []; // Initialize each row
                for (let j = 0; j < this.gridWidth; j++) {
                    this.occupancyGrid[i][j] = -1;
                }
            }
            // Mark arena boundaries as occupied
            this.markArenaBoundaries();
        }
        private initializeQRPositions() {
            const halfWidth = ARENA_WIDTH / 2;
            const halfHeight = ARENA_HEIGHT / 2;
            // QR codes at each corner of the arena
            this.qrPositions = [
                { x: halfWidth, y: halfHeight, cardinal: "NE", id: vision_ns.QRcodeId.East }, // Northeast corner
                { x: halfWidth, y: -halfHeight, cardinal: "SE", id: vision_ns.QRcodeId.East }, // Southeast corner
                { x: halfWidth, y: halfHeight, cardinal: "NE", id: vision_ns.QRcodeId.North }, // Northeast corner
                { x: -halfWidth, y: halfHeight, cardinal: "NW", id: vision_ns.QRcodeId.North }, // Northwest corner
                { x: -halfWidth, y: halfHeight, cardinal: "NW", id: vision_ns.QRcodeId.West }, // Northwest corner
                { x: -halfWidth, y: -halfHeight, cardinal: "SW", id: vision_ns.QRcodeId.West }, // Southwest corner
                { x: -halfWidth, y: -halfHeight, cardinal: "SW", id: vision_ns.QRcodeId.South }, // Southwest corner
                { x: halfWidth, y: -halfHeight, cardinal: "SE", id: vision_ns.QRcodeId.South }, // Southeast corner
            ];
            // Base camp position (can be configured)
            this.basePosition = { x: BASE_CAMP_X, y: BASE_CAMP_Y, cardinal: "Base", id: vision_ns.QRcodeId.Home };
        }
        private markArenaBoundaries() {
            // Mark the arena walls as occupied in the occupancy grid
            for (let i = 0; i < this.gridHeight; i++) {
                for (let j = 0; j < this.gridWidth; j++) {
                    const x = (j * this.gridResolution) - (ARENA_WIDTH / 2);
                    const y = (i * this.gridResolution) - (ARENA_HEIGHT / 2);
                    // Mark boundaries
                    if (Math.abs(x) >= ARENA_WIDTH / 2 - this.gridResolution ||
                        Math.abs(y) >= ARENA_HEIGHT / 2 - this.gridResolution) {
                        this.occupancyGrid[i][j] = 1; // Occupied
                    }
                }
            }
        }
        // Update robot position using visible QR codes and compass heading
        public updateRobotPosition(visibleQRCodes: vision_ns.VisualObject[], compassHeading: number): RobotPose {
            if (visibleQRCodes.length === 0) {
                return this.robotPose;
            }
            const triangulationPoints: { x: number, y: number, weight: number }[] = [];
            // Process each visible QR code for triangulation
            for (const qrCode of visibleQRCodes) {
                if (qrCode.kind === vision_ns.ObjectKind.QRcode && qrCode.id > 0) {
                    const position = this.triangulateFromQRCode(qrCode, compassHeading);
                    if (position) {
                        triangulationPoints.push({
                            x: position.x,
                            y: position.y,
                            weight: this.calculateConfidenceWeight(qrCode)
                        });
                    }
                }
            }
            // Combine multiple triangulation points using weighted average
            if (triangulationPoints.length > 0) {
                const newPose = this.weightedAveragePosition(triangulationPoints);
                newPose.heading = compassHeading;
                // Update robot pose with confidence based on number of visible QR codes
                this.robotPose = newPose;
                this.robotPose.confidence = Math.min(100, triangulationPoints.length * 25);
                this.lastUpdate = input.runningTime();
            }
            // Handle multiple QR codes for improved accuracy
            if (visibleQRCodes.length >= 2) {
                this.refinePositionWithMultipleQRCodes(visibleQRCodes, compassHeading);
            }
            return this.robotPose;
        }
        private triangulateFromQRCode(qrCode: vision_ns.VisualObject, compassHeading: number): { x: number, y: number } | null {
            // Find the QR code position in the arena
            const qrPosition = this.getQRPositionById(qrCode.id);
            if (!qrPosition) return null;
            // Calculate distance to QR code from visual size
            const distance = qrCode.getDistanceBySize();
            // Calculate angle to QR code relative to robot's heading
            const visualAngle = qrCode.getAngle(); // Angle on screen relative to camera center
            const absoluteAngle = (compassHeading + visualAngle) * Math.PI / 180; // Convert to radians
            // Calculate robot position relative to QR code
            const robotX = qrPosition.x - distance * Math.sin(absoluteAngle);
            const robotY = qrPosition.y - distance * Math.cos(absoluteAngle);
            return { x: robotX, y: robotY };
        }
        private refinePositionWithMultipleQRCodes(qrCodes: vision_ns.VisualObject[], compassHeading: number) {
            // Use geometric constraints between QR codes to improve position accuracy
            if (qrCodes.length < 2) return;
            // Sort QR codes by screen position (left to right)
            qrCodes.sort((a, b) => a.x - b.x);
            // Validate spatial relationships between QR codes
            for (let i = 0; i < qrCodes.length - 1; i++) {
                const leftQR = qrCodes[i];
                const rightQR = qrCodes[i + 1];
                if (this.validateQRCodeRelationship(leftQR, rightQR, compassHeading)) {
                    // QR codes are consistent with expected arena layout
                    this.robotPose.confidence = Math.min(100, this.robotPose.confidence + 10);
                }
            }
        }
        private validateQRCodeRelationship(leftQR: vision_ns.VisualObject, rightQR: vision_ns.VisualObject, heading: number): boolean {
            const leftPos = this.getQRPositionById(leftQR.id);
            const rightPos = this.getQRPositionById(rightQR.id);
            if (!leftPos || !rightPos) return false;
            // Calculate expected angular separation between QR codes from robot perspective
            const dx = rightPos.x - leftPos.x;
            const dy = rightPos.y - leftPos.y;
            const expectedAngleDiff = Math.atan2(dx, dy) * 180 / Math.PI;
            // Calculate observed angular separation on screen
            const observedAngleDiff = rightQR.getAngle() - leftQR.getAngle();
            // Allow some tolerance for measurement errors
            const tolerance = 15; // degrees
            return Math.abs(expectedAngleDiff - observedAngleDiff) < tolerance;
        }
        private calculateConfidenceWeight(qrCode: vision_ns.VisualObject): number {
            // Weight based on QR code size (closer = more reliable)
            const size = Math.sqrt(qrCode.w ** 2 + qrCode.h ** 2);
            const baseWeight = Math.min(1.0, size / 50); // Normalize to 0-1
            // Reduce weight for QR codes at edge of field of view
            const centerDistance = Math.abs(qrCode.x - 160); // Assuming 320px width
            const edgeWeight = Math.max(0.5, 1 - centerDistance / 160);
            return baseWeight * edgeWeight;
        }
        private weightedAveragePosition(points: { x: number, y: number, weight: number }[]): RobotPose {
            let totalWeight = 0;
            let weightedX = 0;
            let weightedY = 0;
            for (const point of points) {
                weightedX += point.x * point.weight;
                weightedY += point.y * point.weight;
                totalWeight += point.weight;
            }
            return new RobotPose(
                totalWeight > 0 ? weightedX / totalWeight : 0,
                totalWeight > 0 ? weightedY / totalWeight : 0,
                0 // Heading set separately
            );
        }
        private getQRPositionById(id: number): QRPosition | null {
            return this.qrPositions.find(pos => pos.id === id) || null;
        }
        // Get current robot position
        public getRobotPose(): RobotPose {
            return this.robotPose;
        }
        // Get distance to base camp
        public getDistanceToBase(): number {
            const dx = this.robotPose.x - this.basePosition.x;
            const dy = this.robotPose.y - this.basePosition.y;
            return Math.sqrt(dx * dx + dy * dy);
        }
        // Get bearing to base camp
        public getBearingToBase(): number {
            const dx = this.basePosition.x - this.robotPose.x;
            const dy = this.basePosition.y - this.robotPose.y;
            let bearing = Math.atan2(dx, dy) * 180 / Math.PI;
            return bearing < 0 ? bearing + 360 : bearing;
        }
        // Update occupancy grid with detected obstacles
        public markObstacle(x: number, y: number) {
            const gridX = Math.floor((x + ARENA_WIDTH / 2) / this.gridResolution);
            const gridY = Math.floor((y + ARENA_HEIGHT / 2) / this.gridResolution);
            if (gridX >= 0 && gridX < this.gridWidth && gridY >= 0 && gridY < this.gridHeight) {
                this.occupancyGrid[gridY][gridX] = 1; // Mark as occupied
            }
        }
        // Check if a position is free in the occupancy grid
        public isPositionFree(x: number, y: number): boolean {
            const gridX = Math.floor((x + ARENA_WIDTH / 2) / this.gridResolution);
            const gridY = Math.floor((y + ARENA_HEIGHT / 2) / this.gridResolution);
            if (gridX < 0 || gridX >= this.gridWidth || gridY < 0 || gridY >= this.gridHeight) {
                return false; // Outside arena
            }
            return this.occupancyGrid[gridY][gridX] === 0;
        }
        // Get the occupancy grid for path planning
        public getOccupancyGrid(): number[][] {
            return this.occupancyGrid;
        }
        // Debug: Get all QR code positions
        public getAllQRPositions(): QRPosition[] {
            const allPositions: QRPosition[] = [];
            for (let i = 0; i < this.qrPositions.length; i++) {
                allPositions.push(this.qrPositions[i]);
            }
            allPositions.push(this.basePosition);
            return allPositions;
        }
        // Check if position estimation is recent and reliable
        public isPositionReliable(): boolean {
            const timeSinceUpdate = input.runningTime() - this.lastUpdate;
            return timeSinceUpdate < 5000 && this.robotPose.confidence > 30; // 5 seconds, 30% confidence
        }
        // Diagnostic function to display map information
        public displayMapInfo() {
            const robotPose = this.getRobotPose();
            const qrPositions = this.getAllQRPositions();
            serial.writeLine("=== Detailed Arena Map Status ===");
            serial.writeLine(`Robot: (${Math.round(robotPose.x)}, ${Math.round(robotPose.y)}) heading ${Math.round(robotPose.heading)}°`);
            serial.writeLine(`Confidence: ${robotPose.confidence}%`);
            serial.writeLine(`Position reliable: ${this.isPositionReliable()}`);
            serial.writeLine(`Distance to base: ${Math.round(this.getDistanceToBase())}cm`);
            serial.writeLine(`Bearing to base: ${Math.round(this.getBearingToBase())}°`);
            // List QR code positions
            serial.writeLine("QR Code positions:");
            for (const qr of qrPositions) {
                serial.writeLine(`  ${qr.cardinal} (ID ${qr.id}): (${qr.x}, ${qr.y})`);
            }
        }
    }
    
}