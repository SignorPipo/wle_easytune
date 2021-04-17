/* Doesn't support
    - Placeholder like %d and other similar kind of way to build strings
    - Object to string will result in [Object object]
    - Some messages are not intercepted, like the error from glMatrix.mat4.invert(null, null)
*/

PP.ConsoleVRWidget = class ConsoleVRWidget {

    constructor() {
        this._mySetup = new PP.ConsoleVRWidgetSetup();
        this._myAdditionalSetup = null;

        this._myUI = new PP.ConsoleVRWidgetUI();

        this._myMessages = [];

        this._myIsVisible = true;

        this._myOldConsole = [];

        this._myTypeFilters = [];
        for (let key in PP.ConsoleVRWidget.MessageType) {
            this._myTypeFilters[PP.ConsoleVRWidget.MessageType[key]] = false;
        }

        this._myScrollUp = false;
        this._myScrollDown = false;
        this._myScrollOffset = 0;
        this._myScrollTimer = 0;
        this._myScrollThumbstickTimer = 0;

        this._myPulseTimer = 0;

        this._myLeftGamepad = PP.LeftGamepad; //@EDIT get gamepad LEFT here based on how you store it in your game
        this._myRightGamepad = PP.RightGamepad; //@EDIT get gamepad RIGHT here based on how you store it in your game
    }

    start(parentObject, additionalSetup) {
        this._myAdditionalSetup = additionalSetup;

        this._myUI.build(parentObject, this._mySetup, additionalSetup);

        this._addListeners();

        if (!this._myAdditionalSetup.myShowOnStart) {
            this._toggleVisibility(false);
        }

        this._shimConsoleFunctions();
    }

    //This must be done only when all the setup is complete, to avoid issues with other part of the code calling the console and then triggering the console vr while not ready yet
    _shimConsoleFunctions() {
        this._myOldConsole[PP.ConsoleVRWidget.ConsoleType.LOG] = console.log;
        console.log = this._consolePrint.bind(this, PP.ConsoleVRWidget.ConsoleType.LOG);

        this._myOldConsole[PP.ConsoleVRWidget.ConsoleType.ERROR] = console.error;
        console.error = this._consolePrint.bind(this, PP.ConsoleVRWidget.ConsoleType.ERROR);

        this._myOldConsole[PP.ConsoleVRWidget.ConsoleType.WARN] = console.warn;
        console.warn = this._consolePrint.bind(this, PP.ConsoleVRWidget.ConsoleType.WARN);

        this._myOldConsole[PP.ConsoleVRWidget.ConsoleType.INFO] = console.info;
        console.info = this._consolePrint.bind(this, PP.ConsoleVRWidget.ConsoleType.INFO);

        this._myOldConsole[PP.ConsoleVRWidget.ConsoleType.DEBUG] = console.debug;
        console.debug = this._consolePrint.bind(this, PP.ConsoleVRWidget.ConsoleType.DEBUG);

        this._myOldConsole[PP.ConsoleVRWidget.ConsoleType.ASSERT] = console.assert;
        console.assert = this._consolePrint.bind(this, PP.ConsoleVRWidget.ConsoleType.ASSERT);
    }

    update(dt) {
        this._myUI.update(dt);

        if (this._myIsVisible) {
            this._updateScroll(dt);
        }

        this._updateGamepadsExtraActions(dt);
    }

    //Text section

    _updateText(messageType) {
        let consoleText = "";

        if (!this._myTypeFilters[messageType]) {
            let linesCount = 0;
            let i = this._myMessages.length - 1;

            let scrollLinesToSkip = Math.round(this._myScrollOffset);

            while (i >= 0 && linesCount < this._mySetup.myMaxLines) {
                let message = this._myMessages[i];

                //skip filtered messages
                if (this._myTypeFilters[message.myType]) {
                    i -= 1;
                    continue;
                }

                let messageLines = message.myLines.length;

                //compute line to skip due to scroll offset
                let linesToSkip = 0;
                if (scrollLinesToSkip > 0) {
                    let additionalEmptyLines = 0;
                    if (i != this._myMessages.length - 1) {
                        additionalEmptyLines = this._mySetup.myLinesBetweenMessages;
                    }

                    if (scrollLinesToSkip >= messageLines + additionalEmptyLines) { // + empty lines between messages
                        scrollLinesToSkip -= messageLines + additionalEmptyLines;
                        linesToSkip = messageLines + additionalEmptyLines;
                    } else {
                        linesToSkip = scrollLinesToSkip;
                        scrollLinesToSkip = 0;
                    }
                }

                //add empty lines between messages
                if (i != this._myMessages.length - 1) {
                    let emptyLinesToSkip = this._mySetup.myLinesBetweenMessages - Math.max(this._mySetup.myLinesBetweenMessages - linesToSkip, 0);
                    let emptyLinesToShow = this._mySetup.myLinesBetweenMessages - emptyLinesToSkip;
                    if (linesCount + emptyLinesToShow > this._mySetup.myMaxLines) {
                        emptyLinesToShow = this._myMaxLines - linesCount;
                    }

                    for (let j = 0; j < emptyLinesToShow; j++) {
                        consoleText = ("\n").concat(consoleText);
                    }

                    linesCount += emptyLinesToShow;
                    linesToSkip -= emptyLinesToSkip;
                }

                //computing the number of message lines to show
                let linesToShow = messageLines - linesToSkip;
                if (linesCount + linesToShow > this._mySetup.myMaxLines) {
                    linesToShow = this._mySetup.myMaxLines - linesCount;
                }

                if (linesToShow > 0) {
                    if (message.myType == messageType) {
                        //if the message is the same type of this message text component, add the message lines

                        let linesToPrint = message.myLines.slice(messageLines - linesToShow - linesToSkip, messageLines - linesToSkip);
                        let text = linesToPrint.join("\n");
                        consoleText = (text.concat("\n")).concat(consoleText);

                        linesCount += linesToShow;
                    } else {
                        //otherwise add empty lines, so that the text component with the correct type will have space to show this message

                        for (let j = 0; j < linesToShow; j++) {
                            consoleText = ("\n").concat(consoleText);
                        }

                        linesCount += linesToShow;
                    }
                }

                i -= 1;
            }
        }

        consoleText = this._mySetup.myMessagesTextStartString.concat(consoleText);

        this._myUI.myMessagesTextComponents[messageType].text = consoleText;
    }

    _consolePrint(consoleType, ...args) {
        if (consoleType != PP.ConsoleVRWidget.ConsoleType.ASSERT || (args.length > 0 && !args[0])) {
            let message = this._argsToMessage(consoleType, ...args);
            this._addMessage(message);

            if (this._myMessages.length >= this._mySetup.myMaxMessages + this._mySetup.myMaxMessagesDeletePad) {
                this._myMessages = this._myMessages.slice(this._myMessages.length - this._mySetup.myMaxMessages);
            }

            this._updateAllTexts();

            this._pulseGamepad();
        }

        this._myOldConsole[consoleType].apply(console, args);
    }

    _consoleTypeToMessageType(consoleType) {
        let messageType = PP.ConsoleVRWidget.MessageType.LOG;

        if (consoleType < PP.ConsoleVRWidget.ConsoleType.DEBUG) {
            messageType = consoleType;
        } else if (consoleType == PP.ConsoleVRWidget.ConsoleType.DEBUG) {
            messageType = PP.ConsoleVRWidget.MessageType.LOG;
        } else {
            messageType = PP.ConsoleVRWidget.MessageType.ERROR;
        }

        return messageType;
    }

    _argsToMessage(consoleType, ...args) {
        if (consoleType == PP.ConsoleVRWidget.ConsoleType.ASSERT) {
            args = args.slice(1);
            args.splice(0, 0, this._mySetup.myAssertStartString);
        }

        let messageType = this._consoleTypeToMessageType(consoleType);

        let formattedText = this._formatArgs(...args);

        let lines = this._splitLongLines(formattedText);

        if (messageType == PP.ConsoleVRWidget.MessageType.DEBUG) {
            messageType = PP.ConsoleVRWidget.MessageType.LOG;
        } else if (messageType == PP.ConsoleVRWidget.MessageType.EXCEPTION || messageType == PP.ConsoleVRWidget.MessageType.ASSERT) {
            messageType = PP.ConsoleVRWidget.MessageType.ERROR;
        }


        let message = new PP.ConsoleVRWidget.Message(messageType, lines);

        return message;
    }

    //Here the formatting using placeholder like %d could be implemented in the future
    _formatArgs(...args) {
        let formattedString = args.join(" ");

        return formattedString;
    }

    _splitLongLines(messageText) {
        let linesToSplit = messageText.split("\n");
        let lines = [];
        for (let i = 0; i < linesToSplit.length; i++) {
            let lineToSplit = linesToSplit[i];

            if (lineToSplit.length > this._mySetup.myMaxCharactersPerLine) {
                let spacesAtStart = this._getSpacesAtStart(lineToSplit);
                let spaceToAdd = this._mySetup.myTabString.concat(spacesAtStart);
                let lineSplits = 0;

                while (lineToSplit.length > this._mySetup.myMaxCharactersPerLine && lineSplits < this._mySetup.myMaxLineSplits) {
                    let firstSub = lineToSplit.substr(0, this._mySetup.myMaxCharactersPerLine - 1);
                    let secondSub = lineToSplit.substr(this._mySetup.myMaxCharactersPerLine - 1);
                    secondSub = spaceToAdd.concat(secondSub);

                    lines.push(firstSub);

                    lineToSplit = secondSub;
                    lineSplits++;
                }
                lines.push(lineToSplit);
            } else {
                lines.push(lineToSplit);
            }
        }

        return lines;
    }

    _getSpacesAtStart(text) {
        let spaces = "";
        let i = 0;

        while (i < text.length && text[i] == ' ') {
            spaces = spaces.concat(" ");
            i++;
        }

        return spaces;
    }

    _addMessage(message) {
        let hasSameInfoAsPrev = false;
        if (this._myMessages.length > 0) {
            let lastMessage = this._myMessages[this._myMessages.length - 1];
            if (lastMessage.hasSameInfo(message)) {
                lastMessage.increaseCount();
                hasSameInfoAsPrev = true;
            }
        }

        if (!hasSameInfoAsPrev) {
            this._myMessages.push(message);
        }

        this._adjustScrollOffsetAfterMessageAdded(message, hasSameInfoAsPrev);
    }

    //if you have scrolled, new messages does not move the scroll position
    _adjustScrollOffsetAfterMessageAdded(message, hasSameInfoAsPrev) {
        if (!hasSameInfoAsPrev && !(this._myTypeFilters[message.myType]) && this._myScrollOffset > 0) {
            this._myScrollOffset += message.myLines.length + this._mySetup.myLinesBetweenMessages;
        }
    }

    _updateAllTexts() {
        if (this._myIsVisible) {
            for (let key in PP.ConsoleVRWidget.MessageType) {
                this._updateText(PP.ConsoleVRWidget.MessageType[key]);
            }
        }
    }

    _updateScroll(dt) {
        if (this._myScrollUp) {
            this._myScrollTimer += dt;
            while (this._myScrollTimer > this._mySetup.myScrollDelay) {
                this._myScrollTimer -= this._mySetup.myScrollDelay;
                this._myScrollOffset += this._mySetup.myScrollAmount;
            }
        } else if (this._myScrollDown) {
            this._myScrollTimer += dt;
            while (this._myScrollTimer > this._mySetup.myScrollDelay) {
                this._myScrollTimer -= this._mySetup.myScrollDelay;
                this._myScrollOffset -= this._mySetup.myScrollAmount;
            }
        }

        this._clampScrollOffset();

        if (this._myScrollUp || this._myScrollDown) {
            this._updateAllTexts();
        }
    }

    _clampScrollOffset() {
        let maxScroll = this._getMaxScrollOffset();
        this._myScrollOffset = Math.min(Math.max(this._myScrollOffset, 0), maxScroll); //clamp 
    }

    _getMaxScrollOffset() {
        return Math.max(this._getLinesCount() - this._mySetup.myMaxLines, 0);
    }

    _getLinesCount() {
        let linesCount = 0;
        for (let message of this._myMessages) {
            if (!this._myTypeFilters[message.myType]) {
                linesCount += message.myLines.length + this._mySetup.myLinesBetweenMessages;
            }
        }
        linesCount -= this._mySetup.myLinesBetweenMessages; //empty line is added only between messages
        linesCount = Math.max(linesCount, 0);

        return linesCount;
    }

    //Listener section

    _addListeners() {
        let ui = this._myUI;

        for (let key in PP.ConsoleVRWidget.MessageType) {
            let cursorTarget = ui.myFilterButtonsCursorTargetComponents[PP.ConsoleVRWidget.MessageType[key]];
            let backgroundMaterial = ui.myFilterButtonsBackgroundComponents[PP.ConsoleVRWidget.MessageType[key]].material;
            let textMaterial = ui.myFilterButtonsTextComponents[PP.ConsoleVRWidget.MessageType[key]].material;

            cursorTarget.addClickFunction(this._toggleFilter.bind(this, PP.ConsoleVRWidget.MessageType[key], backgroundMaterial, textMaterial));
            cursorTarget.addHoverFunction(this._filterHover.bind(this, PP.ConsoleVRWidget.MessageType[key], backgroundMaterial));
            cursorTarget.addUnHoverFunction(this._filterUnHover.bind(this, PP.ConsoleVRWidget.MessageType[key], backgroundMaterial));
        }

        {
            let cursorTarget = ui.myClearButtonCursorTargetComponent;
            let backgroundMaterial = ui.myClearButtonBackgroundComponent.material;

            cursorTarget.addClickFunction(this._clearConsole.bind(this));
            cursorTarget.addHoverFunction(this._genericHover.bind(this, backgroundMaterial));
            cursorTarget.addUnHoverFunction(this._genericUnHover.bind(this, backgroundMaterial));
        }

        {
            let cursorTarget = ui.myUpButtonCursorTargetComponent;
            let backgroundMaterial = ui.myUpButtonBackgroundComponent.material;

            cursorTarget.addClickFunction(this._instantScrollUp.bind(this));
            cursorTarget.addHoverFunction(this._setScrollUp.bind(this, backgroundMaterial, true));
            cursorTarget.addUnHoverFunction(this._setScrollUp.bind(this, backgroundMaterial, false));
        }

        {
            let cursorTarget = ui.myDownButtonCursorTargetComponent;
            let backgroundMaterial = ui.myDownButtonBackgroundComponent.material;

            cursorTarget.addClickFunction(this._instantScrollDown.bind(this));
            cursorTarget.addHoverFunction(this._setScrollDown.bind(this, backgroundMaterial, true));
            cursorTarget.addUnHoverFunction(this._setScrollDown.bind(this, backgroundMaterial, false));
        }

        if (this._myAdditionalSetup.myShowVisibilityButton) {
            ui.myVisibilityButtonCursorTargetComponent.addClickFunction(this._toggleVisibility.bind(this, true));
            ui.myVisibilityButtonCursorTargetComponent.addHoverFunction(this._visibilityHover.bind(this, ui.myVisibilityButtonBackgroundComponent.material));
            ui.myVisibilityButtonCursorTargetComponent.addUnHoverFunction(this._visibilityUnHover.bind(this, ui.myVisibilityButtonBackgroundComponent.material));
        }
    }

    _toggleFilter(messageType, backgroundMaterial, textMaterial) {
        if (this._myIsVisible) {
            this._myTypeFilters[messageType] = !this._myTypeFilters[messageType];
            if (this._myTypeFilters[messageType]) {
                textMaterial.color = this._mySetup.myFilterButtonDisabledTextColor;
            } else {
                textMaterial.color = this._mySetup.myMessageTypeColors[messageType];
            }

            this._clampScrollOffset();
            this._updateAllTexts();
        }
    }

    _clearConsole() {
        if (this._myIsVisible) {
            this._myMessages = [];
            this._clampScrollOffset();
            this._updateAllTexts();

            if (this._mySetup.myClearOriginalConsoleWhenClearPressed) {
                console.clear();
            }
        }
    }

    _setScrollUp(material, value) {
        if (this._myIsVisible) {
            if (value) {
                this._myScrollTimer = 0;
                this._genericHover(material);
            } else {
                this._genericUnHover(material);
            }

            this._myScrollUp = value;
        }
    }

    _setScrollDown(material, value) {
        if (this._myIsVisible) {
            if (value) {
                this._myScrollTimer = 0;
                this._genericHover(material);
            } else {
                this._genericUnHover(material);
            }

            this._myScrollDown = value;
        }
    }

    _instantScrollUp() {
        if (this._myIsVisible) {
            this._myScrollOffset = this._getMaxScrollOffset();
            this._updateAllTexts();
        }
    }

    _instantScrollDown() {
        if (this._myIsVisible) {
            this._myScrollOffset = 0;
            this._updateAllTexts();
        }
    }

    _filterHover(messageType, material) {
        this._genericHover(material);
    }

    _filterUnHover(messageType, material) {
        if (this._myTypeFilters[messageType]) {
            material.color = this._mySetup.myFilterButtonDisabledBackgroundColor;
        } else {
            material.color = this._mySetup.myBackgroundColor;
        }
    }

    _genericHover(material) {
        material.color = this._mySetup.myButtonHoverColor;
    }

    _genericUnHover(material) {
        material.color = this._mySetup.myBackgroundColor;
    }

    _toggleVisibility(isButton) {
        if (isButton && !this._myAdditionalSetup.myShowVisibilityButton) {
            return;
        }

        this._myIsVisible = !this._myIsVisible;

        if (this._myIsVisible) {
            this._updateAllTexts();
        }

        this._myUI.setVisible(this._myIsVisible);

        let textMaterial = this._myUI.myVisibilityButtonTextComponent.material;
        let backgroundMaterial = this._myUI.myVisibilityButtonBackgroundComponent.material;
        if (this._myIsVisible) {
            textMaterial.color = this._mySetup.myDefaultTextColor;
            if (!isButton) {
                backgroundMaterial.color = this._mySetup.myBackgroundColor;
            }
        } else {
            textMaterial.color = this._mySetup.myButtonDisabledTextColor;
            if (!isButton) {
                backgroundMaterial.color = this._mySetup.myButtonDisabledBackgroundColor;
            }
        }

    }

    _visibilityHover(material) {
        material.color = this._mySetup.myButtonHoverColor;
    }

    _visibilityUnHover(material) {
        if (this._myIsVisible) {
            material.color = this._mySetup.myBackgroundColor;
        } else {
            material.color = this._mySetup.myButtonDisabledBackgroundColor;
        }
    }

    //Gamepad section 

    _updateGamepadsExtraActions(dt) {
        if (this._myLeftGamepad && this._myRightGamepad) {
            let leftThumbstickJustPressed = this._myLeftGamepad.getButtonInfo(PP.ButtonType.THUMBSTICK).myIsPressed && !this._myLeftGamepad.getButtonInfo(PP.ButtonType.THUMBSTICK).myIsPrevPressed;
            let rightThumbstickJustPressed = this._myRightGamepad.getButtonInfo(PP.ButtonType.THUMBSTICK).myIsPressed && !this._myRightGamepad.getButtonInfo(PP.ButtonType.THUMBSTICK).myIsPrevPressed;

            if ((leftThumbstickJustPressed && this._myRightGamepad.getButtonInfo(PP.ButtonType.THUMBSTICK).myIsPressed) ||
                (rightThumbstickJustPressed && this._myLeftGamepad.getButtonInfo(PP.ButtonType.THUMBSTICK).myIsPressed)) {
                this._toggleVisibility(false);
            }

            this._myPulseTimer = Math.max(this._myPulseTimer - dt, 0);

            this._updateScrollWithThumbstick(dt);
        }
    }

    _updateScrollWithThumbstick(dt) {
        if (this._myIsVisible) {
            let axes = [0, 0];
            if (this._mySetup.myScrollThumbstickHandedness == PP.ConsoleVRWidget.Handedness.LEFT) {
                axes = this._myLeftGamepad.getAxesInfo().myAxes;
            } else if (this._mySetup.myScrollThumbstickHandedness == PP.ConsoleVRWidget.Handedness.RIGHT) {
                axes = this._myRightGamepad.getAxesInfo().myAxes;
            }

            if (Math.abs(axes[1]) > this._mySetup.myScrollThumbstickMinThreshold) {
                this._myScrollThumbstickTimer += dt;

                while (this._myScrollThumbstickTimer > this._mySetup.myScrollThumbstickDelay) {
                    this._myScrollThumbstickTimer -= this._mySetup.myScrollThumbstickDelay;

                    let normalizedScrollAmount = (Math.abs(axes[1]) - this._mySetup.myScrollThumbstickMinThreshold) / (1 - this._mySetup.myScrollThumbstickMinThreshold);
                    this._myScrollOffset += Math.sign(axes[1]) * normalizedScrollAmount * this._mySetup.myScrollThumbstickAmount;
                }

                this._clampScrollOffset();
                this._updateAllTexts();
            } else {
                this._myScrollThumbstickTimer = 0;
            }
        }
    }

    _pulseGamepad() {
        if (this._myLeftGamepad && this._myRightGamepad) {
            let pulseType = this._myAdditionalSetup.myPulseOnNewMessage;
            let pulseEnabled = pulseType == PP.ConsoleVRWidget.PulseOnNewMessage.ALWAYS || (!this._myIsVisible && pulseType == PP.ConsoleVRWidget.PulseOnNewMessage.WHEN_HIDDEN);
            if (pulseEnabled && this._myPulseTimer == 0) {
                if (this._myAdditionalSetup.myHandedness == PP.ConsoleVRWidget.Handedness.RIGHT) {
                    this._myRightGamepad.pulse(this._mySetup.myPulseIntensity, this._mySetup.myPulseDuration);
                } else {
                    this._myLeftGamepad.pulse(this._mySetup.myPulseIntensity, this._mySetup.myPulseDuration);
                }
                this._myPulseTimer = this._mySetup.myPulseDelay;
            }
        }
    }
};

PP.ConsoleVRWidget.MessageType = {
    INFO: 0,
    WARN: 1,
    ERROR: 2,
    LOG: 3
};


PP.ConsoleVRWidget.ConsoleType = {
    INFO: 0,
    WARN: 1,
    ERROR: 2,
    LOG: 3,
    DEBUG: 4,
    ASSERT: 5
};

PP.ConsoleVRWidget.Message = class Message {
    constructor(messageType, messageLines) {
        this.myType = messageType;
        this.myLines = messageLines;

        this._myOriginalText = messageLines.join("\n");

        this._myMessagesCount = 1;
    }

    hasSameInfo(message) {
        return this._myOriginalText == message._myOriginalText && this.myType == message.myType;
    }

    increaseCount() {
        this._myMessagesCount += 1;

        let countString = (("(x").concat(this._myMessagesCount)).concat(") ");

        let text = this._myOriginalText.slice(0);
        text = countString.concat(text);
        this.myLines = text.split("\n");
    }
};

PP.ConsoleVRWidget.Handedness = {
    NONE: 0,
    LEFT: 1,
    RIGHT: 2,
};

PP.ConsoleVRWidget.PulseOnNewMessage = {
    NONE: 0,
    ALWAYS: 1,
    WHEN_HIDDEN: 2,
};