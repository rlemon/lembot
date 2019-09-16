import solver from '../../util/solver';
import { evaluate } from 'mathjs';

function generateAnswer() {
    return Math.floor((Math.random() * 899 + 100));
}

function generateNumbers(big, small) {
    const bigs = [25, 50, 75, 100].sort(() => Math.random() > 0.5 ? 1 : -1);
    const smalls = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].sort(() => Math.random() > 0.5 ? 1 : -1);
    return bigs.slice(0, big).concat(smalls.slice(0, small));
}

function testAnswer(userInput, numbers, answer) {
    const userNumbers = userInput.match(/(\d+)/g);
    if (!userNumbers || userNumbers.length > 6) {
        return [false,null];
    }
    if (!userNumbers.every(num => numbers.includes(Number(num)))) {
        return [false,null];
    }
    if (userInput === answer) {
        return [false,null];
    }
    const userAnswer = evaluate(userInput);
    if (userAnswer === answer) {
        return [true, userAnswer];
    }
    return [false,userAnswer];
}

function endRound(message, storage, playerIndex = false) {
    const gameState = storage.get('countdown_gameState');
    clearTimeout(gameState.roundTimer);
    gameState.roundTimer = null;
    gameState.reminderTimers = gameState.reminderTimers.map(clearTimeout);
    // this is wrong
    let scorecard = playerIndex !== false ? `<@${gameState.participants[playerIndex].id}> is the winner!\n` : '';
    const scores = gameState.participants.map(player => {
        const diff = player.closest > gameState.answer ? gameState.answer / player.closest : player.closest / gameState.answer;
        return [player, diff];
    }).sort((a, b) => {
        return a[1] > b[1] ? 1 : -1;
    }).map(([player, diff], index) => {
        player.score = Math.max(0, Math.floor(10 * diff - index));
        return player;
    });
    for (const player of scores) {
        const total = gameState.participants.find(({ id }) => id === player.id).score += player.score;
        scorecard += `<@${player.id}> has gained ${player.score} points, for a total of ${total} points`;
    }
    message.channel.send(scorecard);
    // end of wrongness
    message.channel.send(`Round ${gameState.currentRound} has ended. possible solution follows:\n${gameState.solution}`);

    gameState.currentRound += 1;
    storage.set('countdown_gameState', gameState);
    if (gameState.currentRound > gameState.rounds) {
        return endGame(message, storage);
    }
    beginNewRound(message, storage);
}

function endGame(message, storage, early = false) {
    const gameState = storage.get('countdown_gameState');
    if (!early && gameState.participants.length) {
        const winner = gameState.participants.reduce((top, player) => {
            if (!top) return player;
            if (top.score > player.score) return top;
            return player;
        });
        message.channel.send(`The game has eneded, the winner is.....\n<@${winner.id}> with a score of ${winner.score}!\nCongratulations! you have won nothing!`);
    } else if (!early) {
        message.channel.send(`The game has ended and no one has won.`);
    }
    storage.set('countdown_gameState', {});
}

function beginNewRound(message, storage) {
    const gameState = storage.get('countdown_gameState');
    gameState.answer = generateAnswer();
    gameState.numbers = generateNumbers(gameState.big, 6 - Number(gameState.big));
    gameState.solution = solver(gameState.numbers, gameState.answer);
    gameState.roundTimer = setTimeout(endRound, gameState.timeout * 60000, message, storage);
    message.channel.send(`Round ${gameState.currentRound} of ${gameState.rounds} beginning.\nAnswer:${gameState.answer}\nNumbers:${gameState.numbers}\ntime for round: ${gameState.timeout} minutes`);
    storage.set('countdown_gameState', gameState);
    generateReminders(message, storage);
}

function generateReminders(message, storage) {
    const gameState = storage.get('countdown_gameState');
    for (let i = 0; i < gameState.reminderTimers.length; i++) {
        gameState.reminderTimers[i] = setTimeout(t => {
            const totalSeconds = t / 1000;
            const totalMinutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds - (totalMinutes * 60);
            let formattedTime = '';
            if (totalMinutes) {
                formattedTime += `${totalMinutes}min`
            }
            if (seconds) {
                formattedTime = `${seconds > 10 ? seconds : `0${seconds}`}sec`;
            }
            message.channel.send(`there is aprox. ${formattedTime || 'no'} remaining in this round.`);
        }, gameState.timeout * 60000 - gameState.timeoutReminders[i] * gameState.timeout * 60000, gameState.timeoutReminders[i] * gameState.timeout * 60000);
    }
    storage.set('countdown_gameState', gameState);
}

export const start = {
    trigger: /^play countdown (\d+)(\sbig)?\s?(\d+)?(\s?min)?\s?(\d+)?(\srounds?)?$/,
    runMatches: (matches,message,storage) => {
        const [input, big=0, strBig, min=4, strMin, rounds=1, strRounds] = matches;
        if ( 
            Number(rounds) <= 0 || 
            Number(min) <= 0 || 
            Number(big) > 4 || 
            Number(rounds) < 1 || 
            Number(rounds) > 10 
        ) {
            return; // why am I like this?
        }
        const gameState = {
            running: true, 
            rounds: Number(rounds),
            currentRound: 1,
            big: Number(big),
            roundTimer: null,
            participants: [],
            timeout: Number(min),
            timeoutReminders: [0.5,0.25,0.1],
            reminderTimers: [null,null,null]
        };
        storage.set('countdown_gameState', gameState);
        beginNewRound(message, storage);

    }
};

export const guess = {
    trigger: /^guess:(.*)$/,
    runMatches: (matches, message, storage) => {
        const gameState = storage.get('countdown_gameState');
        if( !gameState.running ) {
            return;
        }
        const [input, guess] = matches;
        let playerIndex = gameState.participants.findIndex(({id}) => id === message.author.id);
        if (playerIndex === -1 ) {
            playerIndex = gameState.participants.push({id: message.author.id, score: 0, closest: 0}) - 1;
        }
        const userNumbers = guess.match(/(\d+)/g);
        const [correct,possibleScoreAnswer] = testAnswer(guess, gameState.numbers, gameState.answer);
        if( possibleScoreAnswer ) {
            const { closest } = gameState.participants[playerIndex];
            if( Math.abs( possibleScoreAnswer / gameState.answer ) > Math.abs( closest / gameState.answer ) ) {
                gameState.participants[playerIndex].closest = possibleScoreAnswer;
            }
        }
        storage.set('countdown_gameState', gameState);
        if( correct ) {
            return endRound(message, storage, playerIndex);
        } else {
            return message.channel.send('incorrect');
        }
    }
};

export const stop = {
    trigger: /^stop game$/,
    runMatches: ( matches, message, storage) => {
        message.channel.send('Stopping game. goodbye');
        return endGame(message, storage, true);
    }
};
