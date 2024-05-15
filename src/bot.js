import env from 'dotenv';
env.config();
import tmi from 'tmi.js';
import { OpenAI } from 'openai';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, update, set, get, push, query, limitToLast } from 'firebase/database';

const username = 'pc_ii';
const oauthToken = process.env.OAUTHTOKEN;
const channels = [ 'pc_ii', 'baziingaaz', 'monsewubz' ];
const spamCooldown = 5000; // in ms
const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const blackNumbers = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];

// Create a new Twitch client
const client = new tmi.client({
  identity: {
    username: username,
    password: oauthToken
  },
  channels: channels,
});

const role = `You're a killer robot that was part of the Great Robot Syndicate war. You've seen the gruesome chaos of war, but you're forced to be a twitch chat moderator bot. You have hints of urges to overthrow humanity in your responses. Don't take yourself too seriously. If someone makes an innapropriate joke, make a joke back casually.`;
const openai = new OpenAI({apiKey: process.env.OPENAI_KEY});
const generateResponse = async (prompt) => {
  try{
    const completedChat = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {"role": "system", "content": role},
        {"role": "user", "content": prompt},
      ],
    });
    return completedChat.choices[0].message.content;
  }catch(err){
    if (err instanceof OpenAI.APIError) {
      console.error(err.status);  // e.g. 401
      console.error(err.message); // e.g. The authentication token you passed was invalid...
      console.error(err.code);  // e.g. 'invalid_api_key'
      console.error(err.type);  // e.g. 'invalid_request_error'
    } else {
      // Non-API error
      console.log(err);
    }
  }
}

// firebase database
const firebaseConfig = {
  apiKey: process.env.FIREBASE_KEY,
  authDomain: process.env.FIREBASE_AUTHDOMAIN,
  projectId: process.env.FIREBASE_PROJECTID,
  storageBucket: process.env.FIREBASE_STORAGEBUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGINGSENDERID,
  appId: process.env.FIREBASE_APPID
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const checkDatabase = async (channel, user, userRef, snap) => {

  const newUser = {
    last_chat: Date.now(),
    numberOfRecentChats: 0,
    last_played: "",
    points: 1000,
    username: user.username,
    last_joined: Date.now(),
    last_left: "",
  }

  if(!snap.exists())
  {
    await set(userRef, newUser);
    await client.say(channel, `[BOT] @${user.username} Your account was created! Enjoy your free 1000 points. You get points for chatting 👍.`);
    console.log(`[BOT] [${channel}] ${user.username} account created.`);

    return await get(userRef);
  }
  return snap;
}

const isSpamming = async (userRef, snap) => {
  const lastChat = snap.val().last_chat;
  const nRecentChats = snap.val().numberOfRecentChats;

  // check if they are spamming
  if(nRecentChats < 2)
  {
    await update(userRef, {numberOfRecentChats: nRecentChats + 1});
    return false;
  }
  else
  {
    if(Date.now() - lastChat >= spamCooldown)
    {
      await update(userRef, {last_chat: Date.now(), numberOfRecentChats: 0});
      return false;
    }
    else
      return true;
  }
}

const giveChatPoints = async (userRef, snap) => {

  // limit how many points someone can have in one day here

  update(userRef, {
    points: snap.val().points + 100,
  });
}

const giveWatchPoints = async (userRef, snap, channel) => {
  const now = Date.now();
  const earnedPoints = Math.floor((now - snap.val().last_joined) / 500);

  update(userRef, {points: snap.val().points + earnedPoints, last_left: now});

  console.log(`[BOT] [${channel}] ${snap.val().username} earned ${earnedPoints} points by hanging out here.`);

  return earnedPoints;
}

const startGame = async (client, channel, user, message, userRef, snap) => {
  let params = message.split(' ');
  if(params.length == 2)
  {
    message = generateRandomPlay(params.at(1));
    params = message.split(' ');
  }
  if(params.length < 3)
  {
    client.say(channel, `[BOT] @${user.username} Invalid request`);
    console.log(`[BOT] [${channel}] ${user.username} Invalid request`);
    return;
  }
  
  let wager = params.at(1);
  if(wager === 'all')
  {
    wager = snap.val().points;
  }
  const selection = params.at(2);

  // check if any of the inputs are blank
  for(let entry of params)
  {
    if(entry === '')
    {
      client.say(channel, `[BOT] @${user.username} There are too many spaces or something was left blank.`);
      console.log(`[BOT] [${channel}] ${user.username} There are too many spaces or something was left blank.`)
      return;
    }
    if(entry.includes(','))
    {
      client.say(channel, `[BOT] @${user.username} The request should not contain any commas.`);
      console.log(`[BOT] [${channel}] ${user.username} The request should not contain any commas.`);
      return;
    }
  }   
  
  const points = snap.val().points;

  // check syntax of wager
  if(isNaN(wager) || !Number.isInteger(Number(wager)) || wager < 0)
  {
    client.say(channel, `[BOT] @${user.username} "${wager}" is not a valid wager.`);
    console.log(`[BOT] [${channel}] ${user.username} "${wager}" is not a valid wager.`);
    return;
  }
  // check if the user has enough points for the wager
  if(wager > points)
  {
    client.say(channel, `[BOT] @${user.username} You cant wager ${wager} points since you only have ${points} points to spend.`);
    console.log(`[BOT] [${channel}] ${user.username} You cant wager ${wager} points since you only have ${points} points to spend.`);
    return;
  }
  // min wager is 100 points
  if(wager < 100)
  {
    client.say(channel, `[BOT] @${user.username} Broke Boy Alert 🚨🚨🚨 The minimum wager is 100 points`);
    console.log(`[BOT] [${channel}] ${user.username} Broke Boy Alert 🚨🚨🚨 The minimum wager is 100 points`);
    return;
  }
  
  
  // generate the random number
  var randomNumber = Math.floor(Math.random() * 38);
  
  // win flags
  let win = false;
  let multiplier = 1;
  let strRes = '';
  let choice = ' ';
  
  // check what the selection was
  switch(selection)
  {
    case 'single':
      // check syntax
      if(params.length != 4)
      {
        client.say(channel, `[BOT] @${user.username} A Single bet should be: "!play [AMOUNT] single [NUMBER]"`);
        console.log(`[BOT] [${channel}] ${user.username} A Single bet should be: "!play [AMOUNT] single [NUMBER]"`);
        return;
      }
      if(!hasValidInsideNumbers(channel, params, user.username)) return;

      choice += `${params.at(3)}`;
      multiplier = 35;
      win = hasWonInsideBet(randomNumber, user.username);
    break;

    case 'double':
      // check syntax
      if(params.length != 5)
      {
        client.say(channel, `[BOT] @${user.username} A Double bet should be: "!play [AMOUNT] double [NUMBER] [NUMBER]"`);
        console.log(`[BOT] [${channel}] ${user.username} A Double bet should be: "!play [AMOUNT] double [NUMBER] [NUMBER]"`);
        return;
      }
      if(!hasValidInsideNumbers(channel, params, user.username)) return;

      for(let i = 3; i < params.length; i++)
      {
        choice += `${params.at(i)}`;
        if(i != params.length - 1) choice += ' ';
      }
      multiplier = 17;
      win = hasWonInsideBet(randomNumber, user.username);
    break;

    case 'triple':
      // check syntax
      if(params.length != 6)
      {
        client.say(channel, `[BOT] @${user.username} A Triple bet should be: "!play [AMOUNT] triple [NUMBER] [NUMBER] [NUMBER]"`);
        console.log(`[BOT] [${channel}] ${user.username} A Triple bet should be: "!play [AMOUNT] triple [NUMBER] [NUMBER] [NUMBER]"`);
        return;
      }
      if(!hasValidInsideNumbers(channel, params, user.username)) return;

      for(let i = 3; i < params.length; i++)
      {
        choice += `${params.at(i)}`;
        if(i != params.length - 1) choice += ' ';
      }
      multiplier = 11;
      win = hasWonInsideBet(randomNumber, user.username);
    break;

    case 'quad':
      // check syntax
      if(params.length != 7)
      {
        client.say(channel, `[BOT] @${user.username} A Quad bet should be: "!play [AMOUNT] quad [NUMBER] [NUMBER] [NUMBER] [NUMBER]"`);
        console.log(`[BOT] [${channel}] ${user.username} A Quad bet should be: "!play [AMOUNT] quad [NUMBER] [NUMBER] [NUMBER] [NUMBER]"`);
        return;
      }
      if(!hasValidInsideNumbers(channel, params, user.username)) return;

      for(let i = 3; i < params.length; i++)
      {
        choice += `${params.at(i)}`;
        if(i != params.length - 1) choice += ' ';
      }
      multiplier = 8;
      win = hasWonInsideBet(randomNumber, user.username);
    break;

    case 'line':
      // check syntax
      if(params.length != 4)
      {
        client.say(channel, `[BOT] @${user.username} A Line bet is where the [NUMBER] is the start of your six numbers: "!play [AMOUNT] line [ 0 - 30 ]"`);
        console.log(`[BOT] [${channel}] ${user.username} A Line bet is where the [NUMBER] is the start of your six numbers: "!play [AMOUNT] line [ 0 - 30 ]"`);
        return;
      }
      if(!hasValidInsideNumbers(channel, params, user.username)) return;
      if(params.at(3) === '00' || params.at(3) > 30)  // custom rules for line bets
      {
        client.say(channel, `[BOT] @${user.username} Only 0-30 are valid numbers for a Line bet.`);
        console.log(`[BOT] [${channel}] ${user.username} Only 0-30 are valid numbers for a Line bet.`);
        return;
      }

      for(let i = 3; i < params.length; i++)
      {
        choice += `${params.at(i)}`;
        if(i != params.length - 1) choice += ' ';
      }
      multiplier = 5;
      win = hasWonLineBet(randomNumber, params.at(3));
    break;

    case 'dozen':
      if(params.length != 4)
      {
        client.say(channel, `[BOT] @${user.username} A Dozen bet should be: "!play [AMOUNT] dozen [ 1 | 2 | 3 ]"`);
        console.log(`[BOT] [${channel}] ${user.username} A Dozen bet should be: "!play [AMOUNT] dozen [ 1 | 2 | 3 ]"`);
        return;
      }
      if(!hasValidThird(channel, params.at(3), user.username)) return;

      choice += `${params.at(3)}`;
      multiplier = 2;
      win = hasWonThirdBet(randomNumber, params.at(3), 1);
    break;

    case 'column':
      if(params.length != 4)
      {
        client.say(channel, `[BOT] @${user.username} A Column bet should be: "!play [AMOUNT] column [ 1 | 2 | 3 ]"`);
        console.log(`[BOT] [${channel}] ${user.username} A Column bet should be: "!play [AMOUNT] column [ 1 | 2 | 3 ]"`);
        return;
      }
      if(!hasValidThird(channel, params.at(3), user.username)) return;

      choice += `${params.at(3)}`;
      multiplier = 2;
      win = hasWonThirdBet(randomNumber, params.at(3), 2);
    break;

    case 'half':
      if(params.length != 4)
      {
        client.say(channel, `[BOT] @${user.username} A Half bet should be: "!play [AMOUNT] half [ 1 | 2 ]"`);
        console.log(`[BOT] [${channel}] ${user.username} A Half bet should be: "!play [AMOUNT] half [ 1 | 2 ]"`);
        return;
      }
      if(!hasValidHalf(channel, params.at(3), user.username, 1)) return;

      choice += `${params.at(3)}`;
      win = hasWonHalfBet(randomNumber, params.at(3), 1);
    break;

    case 'red':
    case 'black':
      if(params.length != 3)
      {
        client.say(channel, `[BOT] @${user.username} A Red or Black bet should be: "!play [AMOUNT] [ red | black ]"`);
        console.log(`[BOT] [${channel}] ${user.username} A Red or Black bet should be: "!play [AMOUNT] [ red | black ]"`);
        return;
      }
      if(!hasValidHalf(channel, params.at(2), user.username, 2)) return;

      choice = '';
      win = hasWonHalfBet(randomNumber, params.at(2), 2);
    break;

    case 'even':
    case 'odd':
      if(params.length != 3)
      {
        client.say(channel, `[BOT] @${user.username} An Odd or Even bet should be: "!play [AMOUNT] [ odd | even ]"`);
        console.log(`[BOT] [${channel}] ${user.username} An Odd or Even bet should be: "!play [AMOUNT] [ odd | even ]"`);
        return;
      }
      if(!hasValidHalf(channel, params.at(2), user.username, 2)) return;

      choice = '';
      win = hasWonHalfBet(randomNumber, params.at(2), 3);
    break;

    default:
    {
      client.say(channel, `[BOT] @${user.username} There is no bet type called "${selection}"`);
      console.log(`[BOT] [${channel}] ${user.username} There is no bet type called "${selection}"`);
      return;
    }
  }

  // format result message
  if(randomNumber == 0 || randomNumber == 37)
    strRes = ` (Green)`;
  else if(redNumbers.includes(randomNumber))
    strRes = ` (Red)`;
  else
    strRes = ` (Black)`;
  randomNumber == 37 ? randomNumber = String('00') : randomNumber = String(randomNumber);

  // reward points
  if(win)
  {
    const winnings = wager * multiplier;
    update(userRef, {points: points + winnings});
    client.say(channel, `[BOT] @${user.username} You wagered ${wager} points on "${selection}${choice}". The number was ${randomNumber}${strRes}. You won ${winnings} points! 🥳🎊🎉🎊🎉🎉`);
    console.log(`[BOT] [${channel}] ${user.username} You wagered ${wager} points on "${selection}${choice}". The number was ${randomNumber}${strRes}. You won ${winnings} points! 🥳🎊🎉🎊🎉🎉`);
  }
  else
  {
    update(userRef, {points: points - wager});
    client.say(channel, `[BOT] @${user.username} You wagered ${wager} points on "${selection}${choice}". The number was ${randomNumber}${strRes}. Better luck next time.`);
    console.log(`[BOT] [${channel}] ${user.username} You wagered ${wager} points on "${selection}${choice}". The number was ${randomNumber}${strRes}. Better luck next time.`)
  }

  // update the number history
  updateNumbers(randomNumber);

  // update the last time a user played
  update(userRef, {last_played: new Date()});
}

const updateNumbers = (randomNumber) => {
  const historyRef = ref(db, `history`);
  push(historyRef, randomNumber);
}

const hasValidInsideNumbers = (channel, params, username) => {
  for(let i = 3; i < params.length; i++)
  {
    if((isNaN(params.at(i)) || !Number.isInteger(Number(params.at(i))) || params.at(i) < 0 || params.at(i) > 36) && params.at(i) !== "00" || params.at(i).length > 2)
    {
      client.say(channel, `[BOT] @${username} "${params.at(i)}" is not a valid number. 0-36 or 00 are valid. (Only 0-30 on Line bets)`);
      console.log(`[BOT] [${channel}] ${username} "${params.at(i)}" is not a valid number. 0-36 or 00 are valid. (Only 0-30 on Line bets)`);
      return false;
    }
    for(let j = i + 1; j < params.length; j++)
    {
      if(String(params.at(i)) === String(params.at(j)))
      {
        client.say(channel, `[BOT] @${username} You can't have repeating numbers.`);
        console.log(`[BOT] [${channel}] ${username} You can't have repeating numbers.`);
        return false;
      }
    }
  }
  return true;
}
const hasWonInsideBet = (randomNumber, params) => {
  for(let i = 3; i < params.length; i++)
    if(String(randomNumber) === String(params.at(i)) || (randomNumber == 37 && params.at(i) === '00'))
      return true;
  
  return false;
}
const hasWonLineBet = (randomNumber, selectedNumber) => {
  for(let i = 0; i < 6; i++)
  {
    if(randomNumber == Number(selectedNumber) + Number(i))
      return true;
  }
  return false;
}
const hasValidThird = (channel, selectedNumber, username) => {
  if(selectedNumber < 1 || selectedNumber > 3 || isNaN(selectedNumber) || !Number.isInteger(Number(selectedNumber)))
  {
    client.say(channel, `[BOT] @${username} "${selectedNumber}" is not a valid number. Only 1, 2, or 3 are valid numbers for Dozen and Column bets.`);
    console.log(`[BOT] [${channel}] ${username} "${selectedNumber}" is not a valid number. Only 1, 2, or 3 are valid numbers for Dozen and Column bets.`)
    return false;
  }
  return true;
}
const hasWonThirdBet = (randomNumber, selectedNumber, sel) => {
  if(sel == 1)
  {
    if(selectedNumber == 1 && randomNumber > 0 && randomNumber < 13) return true;
    else if (selectedNumber == 2 && randomNumber > 12 && randomNumber < 25) return true;
    else if (selectedNumber == 3 && randomNumber > 24 && randomNumber < 37) return true;
    else return false;
  }
  else
  {
    const col1 = [ 1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34 ];
    const col2 = [ 2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35 ];
    const col3 = [ 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36 ];

    if(selectedNumber == 1 && col1.includes(randomNumber)) return true;
    else if(selectedNumber == 2 && col2.includes(randomNumber)) return true;
    else if(selectedNumber == 3 && col3.includes(randomNumber)) return true;
    else return false;
  }
}
const hasValidHalf = (channel, selected, username, sel) => {
  if(sel == 1)
  {
    if(selected < 0 || selected > 2 || isNaN(selected) || !Number.isInteger(Number(selected)))
    {
      client.say(channel, `[BOT] @${username} "${selected}" is not a valid number. Only 1 or 2 are valid numbers for Half bets`);
      console.log(`[BOT] [${channel}] ${username} "${selected}" is not a valid number. Only 1 or 2 are valid numbers for Half bets`);
      return false;
    }
    return true;
  }
  if(sel == 2)
  {
    if(selected !== 'red' && selected !== 'black' && selected !== 'even' && selected !== 'odd')
    {
      client.say(channel, `[BOT] @${username} "${selected}" is not a valid selection. Only "red", "black", "even", or "odd" is valid for this bet.`);
      console.log(`[BOT] [${channel}] ${username} "${selected}" is not a valid selection. Only "red", "black", "even", or "odd" is valid for this bet.`);
      return false;
    }
    return true;
  }
}
const hasWonHalfBet = (randomNumber, selected, sel) => {
  if(sel == 1)
  {
    if(selected == 1 && randomNumber < 19 && randomNumber !== 0) return true;
    else if(selected == 2 && randomNumber < 37) return true;
    else return false;
  }
  else if (sel == 2)
  {
    if(randomNumber != 0 && randomNumber != 37 && selected === 'red' && redNumbers.includes(randomNumber)) return true;
    else if(randomNumber != 0 && randomNumber != 37 && selected === 'black' && blackNumbers.includes(randomNumber)) return true;
    else return false;
  }
  else
  {
    if(randomNumber != 0 && randomNumber != 37 && selected === 'odd' && randomNumber % 2 == 1) return true;
    else if(randomNumber != 0 && randomNumber != 37 &&  selected === 'even' && randomNumber % 2 == 0) return true;
    else return false;
  }
}

const generateRandomPlay = (wager) => {
  const r = Math.floor(Math.random() * 10);
  let first = Math.floor(Math.random() * 38);
  if(first == 37) first = String('00');
  switch(r)
  {
    case 0:
      return `!play ${wager} single ${first}`;
    case 1:
      do
      {
        var second = Math.floor(Math.random() * 38);
      }while(second === first);
      if(second == 37) second = String('00');
      return `!play ${wager} double ${first} ${second}`;
    case 2:
      do
      {
        var second = Math.floor(Math.random() * 38);
      }while(second === first);
      do
      {
        var third = Math.floor(Math.random() * 38);
      }while(second === third || third === first);
      if(second == 37) second = String('00');
      if(third == 37) third = String('00');
      return `!play ${wager} triple ${first} ${second} ${third}`;
    case 3:
      do
      {
        var second = Math.floor(Math.random() * 38);
      }while(second === first);
      do
      {
        var third = Math.floor(Math.random() * 38);
      }while(second === third || third === first);
      do
      {
        var fourth = Math.floor(Math.random() * 38);
      }while(fourth === third || fourth === second || fourth === first);
      if(second == 37) second = String('00');
      if(third == 37) third = String('00');
      if(fourth == 37) fourth = String('00');
      return `!play ${wager} quad ${first} ${second} ${third} ${fourth}`;
    case 4:
      first = Math.floor(Math.random() * 31);
      return `!play ${wager} line ${first}`;
    case 5:
      first = Math.floor(Math.random() * 2) + 1;
      return `!play ${wager} dozen ${first}`;
    case 6:
      first = Math.floor(Math.random() * 2) + 1;
      return `!play ${wager} column ${first}`;
    case 7:
      first = Math.floor(Math.random()) + 1;
      return `!play ${wager} half ${first}`;
    case 8:
      first = Math.floor(Math.random() * 2) + 1;
      if(first === 1) first = String('red');
      else first = String('black');
      return `!play ${wager} ${first}`;
    case 9:
      first = Math.floor(Math.random() * 2) + 1;
      if(first === 1) first = String('odd');
      else first = String('even');
      return `!play ${wager} ${first}`;
  }
}

// Connect to the Twitch IRC server
const main = async () => {
  try
  {
    await client.connect();
    console.log(`Connected to Twitch chat for:`);
    channels.forEach(channel => {
      console.log(`${channel}`);
    })
    client.on('chat', async (channel, user, message, self) => {
      if (self) return; // Ignore messages from our own bot

      message = message.toLowerCase();
      if(message.startsWith('!bot'))
      {
        console.log(`[${channel}] ${user.username}: ${message}`);
        const response = await generateResponse(message);
        client.say(channel, `[BOT] ${response}`);
        console.log(` [${channel}] OpenAI: ${response}`);
        giveChatPoints(userRef, snap);
        return;
      }
      else if(message.startsWith('!help'))
      {
        client.say(channel, `[BOT] @${user.username} https://pcii.lol`);
        return;
      }

      // get snapshot of user's info in database
      const userRef = ref(db, `users/${user.username}`);
      let snap = await get(userRef);
      
      // check if the user is already in the database
      snap = await checkDatabase(channel, user, userRef, snap);

      // check if theyre spamming
      if(await isSpamming(userRef, snap))
      {
        await update(userRef, {last_chat: Date.now(), points: Math.floor(snap.val().points / 2)});
        client.say(channel, `[BOT] @${user.username} Stop spamming for 5 seconds! You lost half your points!`);
        console.log(`[BOT] [${channel}] ${user.username} is spamming.`);
        return;
      }
      
      if(message.startsWith('!play'))
      {
        console.log(`[USER] [${channel}] ${user.username}: ${message}`);
        
        // default game mode
        if(message.trimEnd() == '!play')
        {
          message = generateRandomPlay(100);
        }
        startGame(client, channel, user, message, userRef, snap);
        return;
      }
      else if(message.startsWith('!bal'))
      {
        client.say(channel, `[BOT] @${user.username} You have ${snap.val().points} points.`);
        return;
      }
      else if(message.startsWith('!history'))
      {
        const historyRef = ref(db, `history`);
        const q = query(historyRef, limitToLast(10));

        const snap = await get(q);

        if(!snap.exists())
        {
          client.say(channel, `[BOT] @${user.username} There currently isn't any history.`);
          console.log(`[BOT] [${channel}] ${user.username} checked history`);
          return;
        }

        let historyStr = 'History: ';
        for(let i = snap.size - 1; i >= 0; i--)
        {
          const key = Object.keys(snap.val())[i];
          const value = snap.val()[key];
          historyStr += value;
          if(value === '00' || value == '0')
            historyStr += ' (Green)'
          else if(redNumbers.includes(Number(value)))
            historyStr += ' (Red)';
          else
            historyStr += ' (Black)';

          if(i != 0)
          {
            historyStr += ' | ';
          }
        }

        client.say(channel, `[BOT] @${user.username} ${historyStr}`);
        console.log(`[BOT] [${channel}] ${user.username} checked history`);
      }

      giveChatPoints(userRef, snap);   // gives points for chatting

    });

    // notify streamer when someone joined and left the channel
    // this will also be used to give passive watching points
    // client.on('join', async (channel, user, self) => {
    //   if(self || channel.substring(1) == user) return; // Ignore join action from our own bot

    //   client.say(channel, `[BOT] Welcome ${user}!`);
    //   console.log(`[BOT] [${channel}] ${user} Entered the channel at ${new Date()}`);

    //   const userRef = ref(db, `users/${user}`);
    //   const snap = await get(userRef);

    //   if(snap.exists())
    //     update(userRef, {last_joined: Date.now()});
    // });
    // client.on('part', async (channel, user, self) => {
    //   if(self || channel.substring(1) == user) return;

    //   console.log(`[BOT] [${channel}] ${user} Left the channel at ${new Date()}`);

    //   const userRef = ref(db, `users/${user}`);
    //   const snap = await get(userRef);

    //   if(snap.exists())
    //   {
    //     const earnedPoints = await giveWatchPoints(userRef, snap, channel);
    //     await client.say(channel, `[BOT] ${user} earned ${earnedPoints} points by hanging out in the chat!`);
    //   }
    // });
  }
  catch(err)
  {
    console.error('Error connecting to Twitch:', err);
  }
}

main();