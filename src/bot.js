require('dotenv').config();
const tmi = require('tmi.js');
const { OpenAI } = require('openai');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, update, set, get } = require('firebase/database');

const username = 'pc_ii';
const oauthToken = process.env.OAUTHTOKEN;
const channels = [ 'pc_ii' ];

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


const checkDatabase = async (channel, user) => {
  const userRef = ref(db, `users/${user.username}`);
  const snap = await get(userRef);

  const newUser = {
    last_played: "",
    points: 1000,
    username: user.username,
  }

  if(!snap.val())
  {
    await set(userRef, newUser);
    client.say(channel, `[BOT] @${user.username} Your account was created! You have 1000 points.`);
    console.log(`[BOT] @${user.username} Your account was created! You have 1000 points.`);
  }
}

const givePoints = async (user) => {
  const userRef = ref(db, `users/${user.username}`);
  const snap = await get(userRef);

  // ADD A LIMIT TO HOW MANY POINTS SOMEONE CAN GET IN A DAY
  update(userRef, {
    points: snap.val().points + 100,
  });
}

const startGame = async (client, channel, user, message) => {
  const params = message.split(' ');
  if(params.length < 3)
  {
    client.say(channel, `[BOT] @${user.username} Invalid request`);
    console.log(`[BOT] @${user.username} Invalid request`);
    return;
  }
  
  const wager = params.at(1);
  const selection = params.at(2);

  // check if any of the inputs are blank
  for(let entry of params)
  {
    if(entry === '')
    {
      client.say(channel, `[BOT] @${user.username} There are too many spaces or something was left blank.`);
      console.log(`[BOT] @${user.username} There are too many spaces or something was left blank.`)
      return;
    }
    if(entry.includes(','))
    {
      client.say(channel, `[BOT] @${user.username} The request should not contain any commas.`);
      console.log(`[BOT] @${user.username} The request should not contain any commas.`);
      return;
    }
  }   
  
  // Connect to database and retrieve points
  const userRef = ref(db, `users/${user.username}`);
  const snap = await get(userRef);
  const points = snap.val().points;

  // check syntax of wager
  if(isNaN(wager) || !Number.isInteger(Number(wager)) || wager < 0)
  {
    client.say(channel, `[BOT] @${user.username} "${wager}" is not a valid wager.`);
    console.log(`[BOT] @${user.username} "${wager}" is not a valid wager.`);
    return;
  }
  // check if the user has enough points for the wager
  if(wager > points)
  {
    client.say(channel, `[BOT] @${user.username} Broke Boy Alert 🚨🚨🚨\nIt costs 100 points to play and you have ${points} points.`);
    console.log(`[BOT] @${user.username} Broke Boy Alert 🚨🚨🚨\nIt costs 100 points to play and you have ${points} points.`);
    return;
  }
  // min wager is 100 points
  if(wager < 100)
  {
    client.say(channel, `[BOT] @${user.username} The minimum wager is 100 points.`);
    console.log(`[BOT] @${user.username} The minimum wager is 100 points.`);
    return;
  }
  
  
  // generate the random number
  var randomNumber = Math.floor(Math.random() * 38);
  
  // win flags
  let win = false;
  let multiplier = 1;
  let strRes = '';
  
  // check what the selection was
  switch(selection)
  {
    case 'single':
      // check syntax
      if(params.length != 4)
      {
        client.say(channel, `[BOT] @${user.username} A Single bet should be: "!play [AMOUNT] single [NUMBER]"`);
        console.log(`[BOT] @${user.username} A Single bet should be: "!play [AMOUNT] single [NUMBER]"`);
        return;
      }
      if(!hasValidInsideNumbers(channel, params, user.username)) return;

      multiplier = 35;
      win = hasWonInsideBet(randomNumber, user.username);
    break;

    case 'double':
      // check syntax
      if(params.length != 5)
      {
        client.say(channel, `[BOT] @${user.username} A Double bet should be: "!play [AMOUNT] double [NUMBER] [NUMBER]"`);
        console.log(`[BOT] @${user.username} A Double bet should be: "!play [AMOUNT] double [NUMBER] [NUMBER]"`);
        return;
      }
      if(!hasValidInsideNumbers(channel, params, user.username)) return;

      multiplier = 17;
      win = hasWonInsideBet(randomNumber, user.username);
    break;

    case 'triple':
      // check syntax
      if(params.length != 6)
      {
        client.say(channel, `[BOT] @${user.username} A Triple bet should be: "!play [AMOUNT] triple [NUMBER] [NUMBER] [NUMBER]"`);
        console.log(`[BOT] @${user.username} A Triple bet should be: "!play [AMOUNT] triple [NUMBER] [NUMBER] [NUMBER]"`);
        return;
      }
      if(!hasValidInsideNumbers(channel, params, user.username)) return;

      multiplier = 11;
      win = hasWonInsideBet(randomNumber, user.username);
    break;

    case 'quad':
      // check syntax
      if(params.length != 7)
      {
        client.say(channel, `[BOT] @${user.username} A Quad bet should be: "!play [AMOUNT] quad [NUMBER] [NUMBER] [NUMBER] [NUMBER]"`);
        console.log(`[BOT] @${user.username} A Quad bet should be: "!play [AMOUNT] quad [NUMBER] [NUMBER] [NUMBER] [NUMBER]"`);
        return;
      }
      if(!hasValidInsideNumbers(channel, params, user.username)) return;

      multiplier = 8;
      win = hasWonInsideBet(randomNumber, user.username);
    break;

    case 'line':
      // check syntax
      if(params.length != 4)
      {
        client.say(channel, `[BOT] @${user.username} A Line bet is where the [NUMBER] is the start of your six numbers: "!play [AMOUNT] line [ 0 - 30 ]"`);
        console.log(`[BOT] @${user.username} A Line bet is where the [NUMBER] is the start of your six numbers: "!play [AMOUNT] line [ 0 - 30 ]"`);
        return;
      }
      if(!hasValidInsideNumbers(channel, params, user.username)) return;
      if(params.at(3) === '00' || params.at(3) > 30)  // custom rules for line bets
      {
        client.say(channel, `[BOT] @${user.username} Only 0-30 are valid numbers for a Line bet.`);
        console.log(`[BOT] @${user.username} Only 0-30 are valid numbers for a Line bet.`);
        return;
      }

      multiplier = 5;
      win = hasWonLineBet(randomNumber, params.at(3));
    break;

    case 'dozen':
      if(params.length != 4)
      {
        client.say(channel, `[BOT] @${user.username} A Dozen bet should be: "!play [AMOUNT] dozen [ 1 | 2 | 3 ]"`);
        console.log(`[BOT] @${user.username} A Dozen bet should be: "!play [AMOUNT] dozen [ 1 | 2 | 3 ]"`);
        return;
      }
      if(!hasValidThird(channel, params.at(3), user.username)) return;

      multiplier = 2;
      win = hasWonThirdBet(randomNumber, params.at(3), 1);
    break;

    case 'column':
      if(params.length != 4)
      {
        client.say(channel, `[BOT] @${user.username} A Column bet should be: "!play [AMOUNT] column [ 1 | 2 | 3 ]"`);
        console.log(`[BOT] @${user.username} A Column bet should be: "!play [AMOUNT] column [ 1 | 2 | 3 ]"`);
        return;
      }
      if(!hasValidThird(channel, params.at(3), user.username)) return;

      multiplier = 2;
      win = hasWonThirdBet(randomNumber, params.at(3), 2);
    break;

    case 'half':
      if(params.length != 4)
      {
        client.say(channel, `[BOT] @${user.username} A Half bet should be: "!play [AMOUNT] half [ 1 | 2 ]"`);
        console.log(`[BOT] @${user.username} A Half bet should be: "!play [AMOUNT] half [ 1 | 2 ]"`);
        return;
      }
      if(!hasValidHalf(channel, params.at(3), user.username, 1)) return;

      win = hasWonHalfBet(randomNumber, params.at(3), 1);
    break;

    case 'red':
    case 'black':
      if(params.length != 3)
      {
        client.say(channel, `[BOT] @${user.username} A Red or Black bet should be: "!play [AMOUNT] [ red | black ]"`);
        console.log(`[BOT] @${user.username} A Red or Black bet should be: "!play [AMOUNT] [ red | black ]"`);
        return;
      }
      if(!hasValidHalf(channel, params.at(2), user.username, 2)) return;

      win = hasWonHalfBet(randomNumber, params.at(2), 2);

      // adding a color description to the results
      if(randomNumber == 0 || randomNumber == 37)
        strRes = ' (Green)';
      else if(randomNumber % 2 == 1)
        strRes = ' (Red)';
      else if(randomNumber %2 == 0)
        strRes = ' (Black)';
    break;

    case 'even':
    case 'odd':
      if(params.length != 3)
      {
        client.say(channel, `[BOT] @${user.username} An Odd or Even bet should be: "!play [AMOUNT] [ odd | even ]"`);
        console.log(`[BOT] @${user.username} An Odd or Even bet should be: "!play [AMOUNT] [ odd | even ]"`);
        return;
      }
      if(!hasValidHalf(channel, params.at(2), user.username, 2)) return;

      win = hasWonHalfBet(randomNumber, params.at(2), 2);
    break;

    default:
    {
      client.say(channel, `[BOT] @${user.username} There is no bet type called "${selection}"`);
      console.log(`[BOT] @${user.username} There is no bet type called "${selection}"`);
      return;
    }
  }

  // format result message
  randomNumber == 37 ? randomNumber = String('00') : randomNumber = String(randomNumber);

  // reward points
  if(win)
  {
    const winnings = wager * multiplier;
    update(userRef, {points: points + winnings});
    client.say(channel, `[BOT] @${user.username} The number was ${randomNumber}${strRes}. You won ${winnings} points! 🥳🎊🎉🎊🎉🎉`);
    console.log(`[BOT] @${user.username} The number was ${randomNumber}${strRes}. You won ${winnings} points! 🥳🎊🎉🎊🎉🎉`);
  }
  else
  {
    update(userRef, {points: points - wager});
    client.say(channel, `[BOT] @${user.username} The number was ${randomNumber}${strRes}. Better luck next time.`);
    console.log(`[BOT] @${user.username} The number was ${randomNumber}${strRes}. Better luck next time.`)
  }

  // update the last time a user played
  update(userRef, {last_played: new Date()});
}
const hasValidInsideNumbers = (channel, params, username) => {
  for(let i = 3; i < params.length; i++)
  {
    if((isNaN(params.at(i)) || !Number.isInteger(Number(params.at(i))) || params.at(i) < 0 || params.at(i) > 36) && params.at(i) !== "00" || params.at(i).length > 2)
    {
      client.say(channel, `[BOT] @${username} "${params.at(i)}" is not a valid number. 0-36 or 00 are valid. (Only 0-30 on Line bets)`);
      console.log(`[BOT] @${username} "${params.at(i)}" is not a valid number. 0-36 or 00 are valid. (Only 0-30 on Line bets)`);
      return false;
    }
    for(let j = i + 1; j < params.length; j++)
    {
      if(String(params.at(i)) === String(params.at(j)))
      {
        client.say(channel, `[BOT] @${username} You can't have repeating numbers.`);
        console.log(`[BOT] @${username} You can't have repeating numbers.`);
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
    console.log(`[BOT] @${username} "${selectedNumber}" is not a valid number. Only 1, 2, or 3 are valid numbers for Dozen and Column bets.`)
    return false;
  }
  return true;
}
const hasWonThirdBet = (randomNumber, selectedNumber, sel) => {
  if(sel == 1)
  {
    console.log(`SELECTED: ${selectedNumber}`);
    console.log(`RANDOM: ${randomNumber}`);
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
      console.log(`[BOT] @${username} "${selected}" is not a valid number. Only 1 or 2 are valid numbers for Half bets`);
      return false;
    }
    return true;
  }
  if(sel == 2)
  {
    if(selected !== 'red' && selected !== 'black' && selected !== 'even' && selected !== 'odd')
    {
      client.say(channel, `[BOT] @${username} "${selected}" is not a valid selection. Only "red", "black", "even", or "odd" is valid for this bet.`);
      console.log(`[BOT] @${username} "${selected}" is not a valid selection. Only "red", "black", "even", or "odd" is valid for this bet.`);
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
  else
  {
    if(randomNumber != 0 && randomNumber != 37 && (selected === 'red' || selected === 'odd') && randomNumber % 2 == 1) return true;
    else if(randomNumber != 0 && randomNumber != 37 && (selected === 'black' || selected === 'even') && randomNumber % 2 == 0) return true;
    else return false;
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

      // check if the user is already in the database
      await checkDatabase(channel, user)

      message = message.toLowerCase();
      if(message.startsWith('!bot'))
      {
        console.log(`${user.username}: ${message}`);
        const response = await generateResponse(message);
        client.say(channel, `[BOT] ${response}`);
        console.log(response);
        givePoints(user);
      }
      else if(message.startsWith('!play'))
      {
        startGame(client, channel, user, message);
        return;
      }
      else if(message.startsWith('!help'))
      {
        client.say(channel, 
        `[BOT] To play, type "!play [AMOUNT] [BET TYPE] [NUMBER(S)]". 
        Ex: <!play 14000 quad 23 14 12 21>
        Single number bets pay 35 to 1. 
        Double number bets pay 17 to 1. 
        Triple number bets pay 11 to 1. 
        Quad number bets pay 8 to 1. 
        Line (six numbers) bets pay 5 to 1. 
        Dozen bets pay 2 to 1. 
        Column bets pay 2 to 1. 
        Half bets (18 numbers) pay even money. 
        Red, black, odd and even bets pay even money.`);
        return;
      }
      else if(message.startsWith('!bal'))
      {
        const userRef = ref(db, `users/${user.username}`);
        const snap = await get(userRef);
        client.say(channel, `[BOT] @${user.username} You have ${snap.val().points} points.`);
        return;
      }

      givePoints(user);   // gives points for chatting

    });

    // notify streamer when someone joined and left the channel
    // this will also be used to give passive watching points
    // client.on('join', async (channel, user, self) => {
    //   if(self) return; // Ignore join action from our own bot
    //   client.say(channel, `[BOT] Welcome ${user}!`);
    //   console.log(`[BOT] [${channel}] ${user} Entered the channel at ${new Date()}`);
    // });
    // client.on('part', async (channel, user, self) => {
    //   if(self) return;
    //   client.say(channel, `[BOT] Goodbye ${user}!`);
    //   console.log(`[BOT] [${channel}] ${user} Left the channel at ${new Date()}`);
    // });
  }
  catch(err)
  {
    console.error('Error connecting to Twitch:', err);
  }
}

main();