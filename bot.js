require('dotenv').config();
const { Client, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');

const SERVER_URL      = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
const BOT_SECRET      = process.env.BOT_API_SECRET || 'acls-bot-secret';
const GUILD_ID        = process.env.DISCORD_GUILD_ID;
const TRACK_ALL       = process.env.TRACK_ALL_CHANNELS === 'true';
const IC_KEYWORDS     = (process.env.IC_CHANNEL_KEYWORDS || 'IC,Dienst,Fahrstunde,Prüfung,Service,Einsatz')
  .split(',').map(s => s.trim().toLowerCase());
const BADGE_CHANNEL_ID    = process.env.BADGE_CHANNEL_ID    || '';
const EOW_CHANNEL_ID      = process.env.EOW_CHANNEL_ID      || '';
const THEORY_CHANNEL_ID   = process.env.THEORY_CHANNEL_ID   || '';
const PRACTICAL_CHANNEL_ID = process.env.PRACTICAL_CHANNEL_ID || '';

const BADGE_LABELS = {
  ic_10: '10h IC-Zeit', ic_50: '50h IC-Zeit', ic_100: '100h IC-Zeit',
  ic_250: '250h IC-Zeit', ic_500: '500h IC-Zeit',
  exams_10: '10 Prüfungen abgenommen', exams_50: '50 Prüfungen abgenommen', exams_100: '100 Prüfungen abgenommen',
  eow_1: '1x Mitarbeiter der Woche', eow_3: '3x Mitarbeiter der Woche', eow_5: '5x Mitarbeiter der Woche',
  cat_pkw: 'PKW-Prüfer', cat_lkw: 'LKW-Prüfer', cat_motorrad: 'Motorrad-Prüfer', cat_flugschein: 'Flugschein-Prüfer',
};

// Laufende Sessions: discord_id → { channelId, channelName, joinedAt, sessionStart }
const activeSessions = new Map();

const TICK_INTERVAL_MS = 15 * 60 * 1000; // 15 Minuten

// Alle 15 Minuten IC-Zeit für alle aktiven Sessions buchen
setInterval(async () => {
  if (activeSessions.size === 0) return;
  const now = new Date();
  console.log(`[Bot] 15-Min-Tick – ${activeSessions.size} aktive Session(s)`);
  for (const [discordId, session] of activeSessions) {
    const minutes = Math.round((now - session.joinedAt) / 60000);
    if (minutes < 1) continue;
    await postSession(discordId, session, now);
    session.joinedAt = now; // Reset → nächster Tick/Leave zählt ab jetzt
  }
}, TICK_INTERVAL_MS);

function isIcChannel(name = '') {
  if (TRACK_ALL) return true;
  const lower = name.toLowerCase();
  return IC_KEYWORDS.some(kw => lower.includes(kw));
}

async function postSession(discord_id, session, leftAt) {
  const durationMs      = leftAt - session.joinedAt;
  const durationMinutes = Math.round(durationMs / 60000);
  const hours           = parseFloat((durationMs / 3600000).toFixed(2));
  const date            = new Date().toISOString().split('T')[0];

  try {
    await fetch(`${SERVER_URL}/api/voice-session`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bot_secret:       BOT_SECRET,
        discord_id,
        channel_id:       session.channelId,
        channel_name:     session.channelName,
        joined_at:        session.joinedAt.toISOString(),
        left_at:          leftAt.toISOString(),
        duration_minutes: durationMinutes,
        hours,
        date,
        notes: `${session.channelName} – ${durationMinutes} Min`,
      }),
    });
    if (durationMinutes >= 1) {
      console.log(`[Bot] IC-Zeit: ${discord_id} – ${durationMinutes} Min in „${session.channelName}"`);
    }
  } catch (err) {
    console.error('[Bot] Fehler beim Senden der Session:', err.message);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
});

async function pollNotifications() {
  try {
    const res = await fetch(`${SERVER_URL}/api/bot-notifications`, {
      headers: { 'x-bot-secret': BOT_SECRET },
    });
    if (!res.ok) return;
    const list = await res.json();
    for (const n of list) {
      try {
        const p = JSON.parse(n.payload);
        if (n.type === 'badge') {
          const label = BADGE_LABELS[p.badgeType] || p.badgeType;
          if (n.discord_id) {
            try {
              const u = await client.users.fetch(n.discord_id);
              await u.send(`🏆 Glückwunsch, **${p.username}**! Du hast das Abzeichen **${label}** verdient!`);
            } catch (_) {}
          }
          if (BADGE_CHANNEL_ID) {
            try {
              const ch = await client.channels.fetch(BADGE_CHANNEL_ID);
              await ch.send(`🏆 **${p.username}** hat das Abzeichen **${label}** verdient!`);
            } catch (e) { console.error('[Bot] Badge-Kanal Fehler:', e.message); }
          }
        }
        if (n.type === 'eow') {
          const msg = `🌟 **Mitarbeiter der Woche – KW ${p.week}**\n🥇 **${p.username}** gewinnt mit **${p.votes} Stimmen** – Herzlichen Glückwunsch! 🎉`;
          if (n.discord_id) {
            try {
              const u = await client.users.fetch(n.discord_id);
              await u.send(`🌟 Glückwunsch! Du bist der **Mitarbeiter der Woche** (KW ${p.week}) mit ${p.votes} Stimmen!`);
            } catch (_) {}
          }
          if (EOW_CHANNEL_ID) {
            try {
              const ch = await client.channels.fetch(EOW_CHANNEL_ID);
              await ch.send(msg);
            } catch (e) { console.error('[Bot] EoW-Kanal Fehler:', e.message); }
          }
        }
        if (n.type === 'exam') {
          const channelId = p.channelType === 'theory' ? THEORY_CHANNEL_ID : PRACTICAL_CHANNEL_ID;
          if (channelId) {
            const [day, month, year] = p.date.split('-').reverse();
            const dateStr = `${day}.${month}.${year}`;
            const embed = new EmbedBuilder()
              .setColor(p.passed ? 0x22c55e : 0xef4444)
              .setTitle(p.passed ? '✅ Prüfung bestanden' : '❌ Prüfung nicht bestanden')
              .addFields(
                { name: '📋 Prüfungsart', value: p.examType, inline: true },
                { name: '👮 Prüfer',      value: p.examinerName, inline: true },
                { name: '📅 Datum',       value: dateStr, inline: true },
              );
            if (p.citizenName) embed.addFields({ name: '👤 Bürger', value: p.citizenName, inline: true });
            if (p.score)       embed.addFields({ name: '📊 Ergebnis', value: `${p.score} (${p.percentage}%)`, inline: true });
            if (!p.passed && p.errors?.length) embed.addFields({ name: '⚠️ Fehler', value: p.errors.join(', '), inline: false });
            try {
              const ch = await client.channels.fetch(channelId);
              await ch.send({ embeds: [embed] });
            } catch (e) { console.error('[Bot] Prüfungskanal Fehler:', e.message); }
          }
        }
        await fetch(`${SERVER_URL}/api/bot-notifications/${n.id}/sent`, {
          method: 'POST', headers: { 'x-bot-secret': BOT_SECRET },
        });
      } catch (e) { console.error('[Bot] Benachrichtigung fehlgeschlagen:', e.message); }
    }
  } catch (e) { console.error('[Bot] Poll-Fehler:', e.message); }
}

client.once(Events.ClientReady, c => {
  console.log(`[Bot] Eingeloggt als ${c.user.tag}`);
  console.log(`[Bot] IC-Schlüsselwörter: ${IC_KEYWORDS.join(', ')}`);
  console.log(`[Bot] Alle Kanäle tracken: ${TRACK_ALL}`);
  console.log(`[Bot] Badge-Kanal: ${BADGE_CHANNEL_ID || 'nicht konfiguriert'}`);
  console.log(`[Bot] EoW-Kanal:   ${EOW_CHANNEL_ID   || 'nicht konfiguriert'}`);
  setInterval(pollNotifications, 30_000);
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  // Nur Ereignisse im konfigurierten Server
  if (GUILD_ID && oldState.guild.id !== GUILD_ID && newState.guild.id !== GUILD_ID) return;

  const discordId    = (newState.member || oldState.member)?.id;
  if (!discordId || discordId === client.user.id) return;

  const leftChannel   = oldState.channel;
  const joinedChannel = newState.channel;

  // Nutzer hat einen Kanal verlassen (oder gewechselt)
  if (leftChannel && (!joinedChannel || leftChannel.id !== joinedChannel.id)) {
    const session = activeSessions.get(discordId);
    if (session) {
      activeSessions.delete(discordId);
      await postSession(discordId, session, new Date());
      fetch(`${SERVER_URL}/api/active-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_secret: BOT_SECRET, discord_id: discordId, joined_at: null }),
      }).catch(() => {});
    }
  }

  // Nutzer ist einem Kanal beigetreten (oder gewechselt)
  if (joinedChannel && (!leftChannel || leftChannel.id !== joinedChannel.id)) {
    if (isIcChannel(joinedChannel.name)) {
      const joinedAt = new Date();
      activeSessions.set(discordId, {
        channelId:   joinedChannel.id,
        channelName: joinedChannel.name,
        joinedAt,
      });
      console.log(`[Bot] Tracking: ${newState.member?.displayName} → ${joinedChannel.name}`);
      fetch(`${SERVER_URL}/api/active-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_secret: BOT_SECRET, discord_id: discordId, username: newState.member?.displayName, channel_name: joinedChannel.name, joined_at: joinedAt.toISOString() }),
      }).catch(() => {});
    }
  }
});

// Server-Nickname geändert → Namen auf der Website synchronisieren
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  if (GUILD_ID && newMember.guild.id !== GUILD_ID) return;
  const oldName = oldMember.nickname || oldMember.user.globalName || oldMember.user.username;
  const newName = newMember.nickname || newMember.user.globalName || newMember.user.username;
  if (oldName === newName && oldMember.user.avatar === newMember.user.avatar) return;
  try {
    await fetch(`${SERVER_URL}/api/sync-member`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bot_secret:  BOT_SECRET,
        discord_id:  newMember.id,
        username:    newName,
        avatar:      newMember.user.avatar,
      }),
    });
    console.log(`[Bot] Namen synchronisiert: ${newMember.id} → ${newName}`);
  } catch (e) { /* Server nicht erreichbar, ignorieren */ }
});

// Beim Bot-Shutdown offene Sessions speichern
async function gracefulShutdown() {
  console.log('[Bot] Shutdown – speichere offene Sessions...');
  const now = new Date();
  for (const [discordId, session] of activeSessions) {
    await postSession(discordId, session, now);
  }
  process.exit(0);
}

process.on('SIGINT',  gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

if (!process.env.DISCORD_BOT_TOKEN) {
  console.error('[Bot] Kein DISCORD_BOT_TOKEN in .env gesetzt!');
  process.exit(1);
}
client.login(process.env.DISCORD_BOT_TOKEN);
