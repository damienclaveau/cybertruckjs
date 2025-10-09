namespace pid_ns {

    /**
     * Utility function to clamp a value between limits
     * @param value - Value to clamp
     * @param limits - [lower, upper] limits array
     * @returns Clamped value
     */
    function clamp(value: number | null, limits: (number | null)[]): number | null {
        const [lower, upper] = limits;
        if (value == null) return value;
        else if (upper != null && value > upper) return upper;
        else if (lower != null && value < lower) return lower;
        return value;
    }

    /**
     * Configuration options for PID controller
     */
    interface PIDOptions {
        /** Sample time in milliseconds (default: 10) */
        sampleTime?: number | null;
        /** Output limits [lower, upper] (default: []) */
        outputLimits?: (number | null)[];
        /** Auto mode enabled (default: true) */
        autoMode?: boolean;
        /** Use proportional on measurement instead of error (default: false) */
        proportionalOnMeasurement?: boolean;
        /** Error mapping function (default: x => x) */
        errorMap?: (error: number) => number;
    }

    /**
     * Advanced Proportional-Integral-Derivative (PID) Controller
     * 
     * Features:
     * - Output limiting with integral windup protection
     * - Proportional-on-measurement option to reduce derivative kick
     * - Sample time control
     * - Auto/manual mode switching
     * - Custom error mapping function
     */
    export class PID {
        // PID gains
        public kp: number;
        public ki: number;
        public kd: number;
        // Setpoint
        public setpoint: number;
        // Configuration
        public sampleTime: number | null;
        public proportionalOnMeasurement: boolean;
        public errorMap: (error: number) => number;
        // PID components
        public proportional: number = 0;
        public integral: number = 0;
        public derivative: number = 0;
        // Internal state
        private _autoMode: boolean;
        private _outputLimits: (number | null)[];
        private _lastTime: number | null = null;
        private _lastOutput: number | null = null;
        private _lastInput: number | null = null;

        /**
         * Create a new PID controller
         * @param kp - Proportional gain
         * @param ki - Integral gain
         * @param kd - Derivative gain
         * @param setpoint - Target setpoint
         * @param options - Configuration options
         */
        constructor(
            kp: number,
            ki: number,
            kd: number,
            setpoint: number,
            options: PIDOptions = {}
        ) {
            const {
                sampleTime = 10,
                outputLimits = [],
                autoMode = true,
                proportionalOnMeasurement = false,
                errorMap = (x: number) => x
            } = options;

            this.kp = kp;
            this.ki = ki;
            this.kd = kd;
            this.setpoint = setpoint;
            this.sampleTime = sampleTime;
            this._outputLimits = outputLimits;
            this.proportionalOnMeasurement = proportionalOnMeasurement;
            this.errorMap = errorMap;
            this._autoMode = autoMode;
            this.reset();
        }

        /**
         * Update the PID controller with a new input value
         * @param input - Current process variable value
         * @param dt - Time delta in milliseconds (optional, will calculate if not provided)
         * @returns Control output
         */
        public update(input: number, dt: number | null = null): number | null {
            if (!this.autoMode) return this._lastOutput;

            const now = control.millis();

            if (dt == null) dt = (this._lastTime != null) ? now - this._lastTime : 1;
            if (dt <= 0) throw new RangeError(`invalid dt value ${dt}, must be positive`);

            // Check sample time constraint
            if (this.sampleTime != null && dt < this.sampleTime && this._lastOutput != null) {
                return this._lastOutput;
            }

            dt = dt / 1000; // Convert to seconds
            const error = this.errorMap(this.setpoint - input);
            const dInput = input - (this._lastInput ?? input);

            // Calculate proportional term
            if (this.proportionalOnMeasurement) {
                this.proportional -= this.kp * dInput;
            } else {
                this.proportional = this.kp * error;
            }

            // Calculate integral term with windup protection
            this.integral += this.ki * error * dt;
            this.integral = clamp(this.integral, this._outputLimits) ?? this.integral;

            // Calculate derivative term (derivative on measurement to avoid derivative kick)
            this.derivative = -this.kd * dInput / dt;

            // Calculate total output with limits
            const output = clamp(
                this.proportional + this.integral + this.derivative,
                this._outputLimits
            ) ?? (this.proportional + this.integral + this.derivative);

            // Update state
            this._lastTime = now;
            this._lastOutput = output;
            this._lastInput = input;

            return output;
        }
        public get autoMode(): boolean {
            return this._autoMode;
        }
        public set autoMode(value: boolean) {
            this.setAutoMode(value);
        }
        public get outputLimits(): (number | null)[] {
            return this._outputLimits;
        }

        /**
         * Set output limits
         */
        public set outputLimits(value: (number | null)[]) {
            if (value == null) value = [];
            const [lower, upper] = value;
            if (lower != null && upper != null && lower >= upper) {
                throw new RangeError('lower limit must be less than upper');
            }
            this._outputLimits = value;
            this.integral = clamp(this.integral, value) ?? this.integral;
            this._lastOutput = clamp(this._lastOutput, value) ?? this._lastOutput;
        }

        /**
         * Set auto mode with optional output initialization
         * @param enabled - Enable auto mode
         * @param lastOutput - Last output value for bumpless transfer
         */
        public setAutoMode(enabled: boolean, lastOutput: number | null = null): void {
            if (enabled && !this._autoMode) {
                this.reset();
                this.integral = clamp(lastOutput ?? 0, this._outputLimits) ?? 0;
            }
            this._autoMode = enabled;
        }

        /**
         * Reset the PID controller internal state
         */
        public reset(): void {
            this.proportional = 0;
            this.integral = clamp(this.integral, this._outputLimits) ?? this.integral;
            this.derivative = 0;
            this._lastTime = control.millis();
            this._lastOutput = null;
            this._lastInput = null;
        }

        /**
         * Get detailed PID state information
         */
        public getState(): {
            proportional: number;
            integral: number;
            derivative: number;
            output: number | null;
            error: number | null;
            autoMode: boolean;
        } {
            const error = this._lastInput != null ? this.setpoint - this._lastInput : null;
            return {
                proportional: this.proportional,
                integral: this.integral,
                derivative: this.derivative,
                output: this._lastOutput,
                error: error,
                autoMode: this._autoMode
            };
        }

        /**
         * Update PID gains
         * @param kp - Proportional gain
         * @param ki - Integral gain  
         * @param kd - Derivative gain
         */
        public setGains(kp: number, ki: number, kd: number): void {
            this.kp = kp;
            this.ki = ki;
            this.kd = kd;
        }

        /**
         * Get current PID gains
         */
        public getGains(): { kp: number; ki: number; kd: number } {
            return {
                kp: this.kp,
                ki: this.ki,
                kd: this.kd
            };
        }
        public setSetpoint(setpoint: number): void {
            this.setpoint = setpoint;
        }
        public getSetpoint(): number {
            return this.setpoint;
        }
    }

}