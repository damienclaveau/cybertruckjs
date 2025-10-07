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
        UTBBot.emitAcknowledgement(UTBBotCode.IntercomType.IOBEY)
        UTBBot.newBotStatus(UTBBotCode.BotStatus.Idle)
        this.mode = GameMode.Slave
        basic.showIcon(IconNames.Angry)
        //music.setTempo(360)
        //music._playDefaultBackground(music.builtInPlayableMelody(Melodies.Funk), music.PlaybackMode.UntilDone)
        logger.log("Robot in Slave mode");
    }
    public doStart() {
        if (this.mode == GameMode.Slave) {
            this.setState(GameState.Started)
            this.startTime = control.millis()
            robot.doStart()
            // Acknowledge the command
            UTBBot.emitAcknowledgement(UTBBotCode.IntercomType.START)
            UTBBot.newBotStatus(UTBBotCode.BotStatus.Search)
            logger.debug(">Start<")
            music._playDefaultBackground(music.builtInPlayableMelody(Melodies.PowerUp), music.PlaybackMode.InBackground)
            basic.showLeds(`
            . . . . .
            . . # . .
            . # # # .
            # # # # #
            . . . . .
            `)
        }
        else {
            logger.log("Asked to Start but not in Slave mode");
        }
    }
    public doStop() {
        this.setState(GameState.Stopped)
        robot.doStop()
        // Acknowledge the command
        UTBBot.emitAcknowledgement(UTBBotCode.IntercomType.STOP)
        UTBBot.newBotStatus(UTBBotCode.BotStatus.Idle)
        logger.debug(">Stop<")
        music._playDefaultBackground(music.builtInPlayableMelody(Melodies.PowerDown), music.PlaybackMode.InBackground)
        basic.showLeds(`
        . . . . .
        . # # # .
        . # # # .
        . # # # .
        . . . . .
        `)
    }
    public doDanger() {
        robot.askGoingHome()
        // Acknowledge the command
        UTBBot.emitAcknowledgement(UTBBotCode.IntercomType.DANGER)
        UTBBot.newBotStatus(UTBBotCode.BotStatus.ToShelter)
        logger.debug(">Danger<")
        music._playDefaultBackground(music.builtInPlayableMelody(Melodies.BaDing), music.PlaybackMode.InBackground)
        basic.showIcon(IconNames.Skull)
    }
}




// Button events
function initButtonsEvents(){
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
        UTBRadio.incrementRadioGroup()
        UTBRadio.showRadioGroup()
    })
}

function initGameControl() {
    // Radio events
    UTBBot.onMessageStartReceived(function () {
        bricksGame.doStart()
    })
    UTBBot.onMessageStopReceived(function () {
        bricksGame.doStop()
    })
    UTBBot.onMessageDangerReceived(function () {
        bricksGame.doDanger()
    })

    let receivedString = ""
    UTBBot.initAsBot(UTBBotCode.TeamName.TeslaCybertruck)
    UTBBot.newBotStatus(UTBBotCode.BotStatus.Idle)
    UTBRadio.showRadioGroup()
    loops.everyInterval(15000, function () {
        logger.log("<hearbeat>")
        UTBBot.emitHeartBeat()
    })
    loops.everyInterval(60000, function () {
        logger.log("<status>")
        UTBBot.emitStatus()
    })
}


/*
source : https://github.com/Taccart/amaker-unleash-the-brick-example/blob/master/main.ts
source : https://github.com/Taccart/amaker-unleash-the-bricks-2025-lib-usage-demo/blob/master/main.ts
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