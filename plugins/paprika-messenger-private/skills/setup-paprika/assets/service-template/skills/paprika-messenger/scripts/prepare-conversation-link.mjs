import { conversationLink, confirmationConversationLink } from './conversation-link.mjs';

try {
  const action = process.argv[2];
  if (process.argv.length !== 3 || !['get', 'confirmation'].includes(action))
    throw Error('Usage: node prepare-conversation-link.mjs get|confirmation < verified-input.json');
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) { size += chunk.length; if (size > 32768) throw Error('Link input exceeds 32 KiB.'); chunks.push(chunk); }
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  console.log(JSON.stringify({ conversation_link: action === 'get' ? conversationLink(input) : confirmationConversationLink(input) }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
