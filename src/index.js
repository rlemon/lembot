import { Client } from 'discord.js';
import { TOKEN } from './config.js';
import * as commands from './commands';

const client = new Client();

client.on('ready', () =>
    console.log( `Logged in as ${client.user.tag}` )
);

client.on('message', parseMessage);

client.login( TOKEN );

const storage = new Map();

function parseMessage( message ) {

    if( message.author.id === client.user.id ) {
        return;
    }

    for( const commandset of Object.values(commands) ) {
        if( commandset.restrict.includes(message.channel.id) ) {
            for (const [commandKey, command] of Object.entries(commandset) ) {
                if( commandKey === 'restrict' ) {
                    continue;
                }
                const matches = message.content.match(command.trigger);
                if( matches ) {
                    console.log(command);
                    command.runMatches( matches, message, storage );
                }
            }
        }
    }
}
