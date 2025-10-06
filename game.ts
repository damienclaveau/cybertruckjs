enum GameMode {
    Free, // Free running Robot until OBEY gets received
    Slave, // Obey to Radio instructions
}
enum GameState {
    Started,
    Stopped,
}
class BricksGame {
    mode: GameMode = GameMode.Free
    state: GameState = GameState.Stopped
    startTime: number = -1;
    constructor() {
    }
    public remainingTime(): number {
        if (this.state == GameState.Started) {
            return GAME_DURATION - (control.millis() - this.startTime) / 1000;
        }
        else return GAME_DURATION;// any positive number would be okay
    }
    public setState(state: GameState) {
        if (this.state != state) {
            this.state = state
            logger.log("Robot State changed : " + ("" + this.state))
        }
    }
    public doObey() {
        // Acknowledge the command
        //UTBController.sendObeyMe()
        this.mode = GameMode.Slave
        basic.showIcon(IconNames.Angry)
        //music.setTempo(360)
        //music._playDefaultBackground(music.builtInPlayableMelody(Melodies.Funk), music.PlaybackMode.UntilDone)
        logger.log("Robot in Slave mode");
    }
    public doStart() {
        if (this.mode == GameMode.Slave) {
            // Acknowledge the command
            //UTBController.sendActionStart()
            this.setState(GameState.Started)
            this.startTime = control.millis()
            robot.doStart()
            basic.showIcon(IconNames.Happy)
            //music.setTempo(360)
            //music._playDefaultBackground(music.builtInPlayableMelody(Melodies.PowerUp), music.PlaybackMode.InBackground)
        }
        else {
            logger.log("Asked to Start but not in Slave mode");
        }
    }
    public doStop() {
        // Acknowledge the command
        //UTBController.sendActionStop()
        this.setState(GameState.Stopped)
        robot.doStop()
        basic.showIcon(IconNames.Asleep)
        //music.setTempo(360)
        //music._playDefaultBackground(music.builtInPlayableMelody(Melodies.PowerDown), music.PlaybackMode.InBackground)
    }
    public doDanger() {
        // Acknowledge the command
        //UTBController.sendActionDanger()
        robot.askGoingHome()
        basic.showLeds(`
            # # . # #
            # # . # #
            . . . . .
            # # # # #
            # # # # #
            `)
        basic.showIcon(IconNames.Surprised)
        //music.setTempo(360)
        //for (let index = 0; index < 4; index++) {
        //    music._playDefaultBackground(music.builtInPlayableMelody(Melodies.BaDing), music.PlaybackMode.UntilDone)
       // }
    }
}

// Radio messages received from the controller
function handleControllerDataReceived(receivedString: string) {

}


// Button events
function initButtonsEvents() {
    input.onButtonPressed(Button.A, function () {
        bricksGame.doStart()
    })
    input.onButtonPressed(Button.AB, function () {
        bricksGame.doStop()
    })
    input.onLogoEvent(TouchButtonEvent.Pressed, function () {
        bricksGame.doObey()
    })
    input.onButtonPressed(Button.B, function () {
        bricksGame.doDanger()
    })
    // Logo Button Long Pressed to change the radio group
    input.onLogoEvent(TouchButtonEvent.LongPressed, function () {
        //UTBRadio.showRadioGroup()
        //UTBRadio.incrementRadioGroup()
        //UTBRadio.showRadioGroup()
    })
}

// Radio events
serial.onDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    handleControllerDataReceived(serial.readLine())
})

function initGameController() {
    //UTBController.initAsController()
    //UTBRadio.showRadioGroup()
}
/*
//source : https://github.com/Taccart/amaker-unleash-the-brick-example/blob/master/main.ts
UnleashTheBricks.setLogLevel(LogLevel.Debug)
UnleashTheBricks.setEchoToConsole(true)
UnleashTheBricks.initCommunicationChannel(CommunicationChannel.Radio)
UnleashTheBricks.setBotStatus(BotStatus.Searching)
UnleashTheBricks.setBotStatus(BotStatus.Capturing)
UnleashTheBricks.setBotStatus(BotStatus.BringingBack)
basic.forever(function () {
    UnleashTheBricks.emitHeartBeat()
    control.waitMicros(10000000)
})
*/