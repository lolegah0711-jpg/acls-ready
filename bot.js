require('dotenv').config();
const { Client, GatewayIntentBits, Events, EmbedBuilder, SlashCommandBuilder, REST, Routes, Partials, AuditLogEvent } = require('discord.js');
const fetch = require('node-fetch');
const cron  = require('node-cron');

const SERVER_URL      = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
const BOT_SECRET      = process.env.BOT_API_SECRET || (process.env.NODE_ENV === 'production'
  ? (() => { console.error('[FATAL] BOT_API_SECRET nicht gesetzt'); process.exit(1); })()
  : 'acls-bot-secret-dev');
const GUILD_ID        = process.env.DISCORD_GUILD_ID;
const TRACK_ALL       = process.env.TRACK_ALL_CHANNELS === 'true';
const IC_KEYWORDS     = (process.env.IC_CHANNEL_KEYWORDS || 'IC,Dienst,Fahrstunde,Prüfung,Service,Einsatz')
  .split(',').map(s => s.trim().toLowerCase());
const BADGE_CHANNEL_ID    = process.env.BADGE_CHANNEL_ID    || '';
const EOW_CHANNEL_ID      = process.env.EOW_CHANNEL_ID      || '';
const THEORY_CHANNEL_ID   = process.env.THEORY_CHANNEL_ID   || '';
const PRACTICAL_CHANNEL_ID = process.env.PRACTICAL_CHANNEL_ID || '';
const IC_LOG_CHANNEL_ID   = process.env.IC_LOG_CHANNEL_ID   || '';
const COMMANDS_CHANNEL_ID = process.env.COMMANDS_CHANNEL_ID || '';
const MOD_LOG_CHANNEL_ID  = process.env.MOD_LOG_CHANNEL_ID  || '1476285851402113182';
const TOURNAMENT_CHANNEL_ID = process.env.TOURNAMENT_CHANNEL_ID || process.env.EOW_CHANNEL_ID || '';
const VIP_ROLE_NAME         = process.env.VIP_ROLE_NAME || 'VIP ⭐';
const AUTO_ROLE_NAME      = process.env.AUTO_ROLE_NAME       || 'ACLS Member';

const BADGE_LABELS = {
  ic_10: '10h IC-Zeit', ic_50: '50h IC-Zeit', ic_100: '100h IC-Zeit',
  ic_250: '250h IC-Zeit', ic_500: '500h IC-Zeit',
  exams_10: '10 Prüfungen abgenommen', exams_50: '50 Prüfungen abgenommen', exams_100: '100 Prüfungen abgenommen',
  eow_1: '1x Mitarbeiter der Woche', eow_3: '3x Mitarbeiter der Woche', eow_5: '5x Mitarbeiter der Woche',
  cat_pkw: 'PKW-Prüfer', cat_lkw: 'LKW-Prüfer', cat_motorrad: 'Motorrad-Prüfer', cat_flugschein: 'Flugschein-Prüfer',
  game_3: '3 Minispiele gespielt', game_10: '10 Minispiele gespielt',
  duel_5: '5 Duell-Siege', duel_25: '25 Duell-Siege',
  coins_1k: '1.000 Coins verdient', coins_10k: '10.000 Coins verdient',
  tow_pro: 'Abschlepp-Profi (1.000+ Punkte)', bj_500: 'High Roller (500+ Blackjack-Gewinn)',
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
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.User],
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
        if (n.type === 'bracket') {
          if (EOW_CHANNEL_ID) {
            try {
              const ch = await client.channels.fetch(EOW_CHANNEL_ID);
              if (p.action === 'start') {
                const embed = new EmbedBuilder()
                  .setColor(0xf472b6)
                  .setTitle('⚔️ Duell-Turnier gestartet!')
                  .setDescription(`8 Spieler kämpfen im K.o.-System um **${p.pot} 🪙**:\n${p.players.map(n2 => `• **${n2}**`).join('\n')}`)
                  .setFooter({ text: 'Viertelfinale läuft – jedes Match: 8 Fragen, 6 Minuten Zeit' })
                  .setTimestamp();
                await ch.send({ embeds: [embed] });
              }
              if (p.action === 'done') {
                const embed = new EmbedBuilder()
                  .setColor(0xfbbf24)
                  .setTitle('⚔️ Duell-Turnier beendet!')
                  .setDescription(`🏆 **${p.username}** gewinnt das Turnier und **${p.prize} 🪙**!${p.runner ? `\n🥈 **${p.runner}** erhält ${p.prize2} 🪙` : ''}`)
                  .setTimestamp();
                await ch.send({ embeds: [embed] });
              }
            } catch (e) { console.error('[Bot] Bracket-Kanal Fehler:', e.message); }
          }
          if (p.action === 'done' && n.discord_id) {
            try {
              const u = await client.users.fetch(n.discord_id);
              await u.send(`⚔️ Glückwunsch! Du hast das **Duell-Turnier** gewonnen: **+${p.prize} ACLS-Coins**! 🏆`);
            } catch (_) {}
          }
        }
        if (n.type === 'vip' || n.type === 'vip_remove') {
          try {
            const guild = client.guilds.cache.get(GUILD_ID) || await client.guilds.fetch(GUILD_ID);
            let role = guild.roles.cache.find(r => r.name === VIP_ROLE_NAME);
            if (!role && n.type === 'vip') {
              role = await guild.roles.create({ name: VIP_ROLE_NAME, color: 0xffd700, hoist: true, reason: 'ACLS VIP (Coin-Shop)' }).catch(() => null);
            }
            if (role && n.discord_id) {
              const member = await guild.members.fetch(n.discord_id).catch(() => null);
              if (member) {
                if (n.type === 'vip') {
                  await member.roles.add(role).catch(e => console.error('[Bot] VIP-Rolle add:', e.message));
                  try {
                    await member.send(p.test
                      ? `⭐ **VIP-Test aktiviert!** Du hast die VIP-Rolle jetzt für **10 Minuten** zum Ausprobieren.`
                      : `⭐ Du bist jetzt **VIP** auf dem ACLS-Server – 30 Tage lang! Viel Spaß!`);
                  } catch (_) {}
                } else {
                  await member.roles.remove(role).catch(e => console.error('[Bot] VIP-Rolle remove:', e.message));
                  try { await member.send(`⭐ Deine **VIP-Rolle** ist abgelaufen. Du kannst sie jederzeit im Coin-Shop verlängern!`); } catch (_) {}
                }
              }
            }
          } catch (e) { console.error('[Bot] VIP Fehler:', e.message); }
        }
        if (n.type === 'lottery') {
          if (n.discord_id) {
            try {
              const u = await client.users.fetch(n.discord_id);
              await u.send(`🎟️ JACKPOT! Du hast die **Wochenlotterie** gewonnen: **${p.pot} ACLS-Coins**! 🎉`);
            } catch (_) {}
          }
          if (EOW_CHANNEL_ID) {
            try {
              const ch = await client.channels.fetch(EOW_CHANNEL_ID);
              const embed = new EmbedBuilder()
                .setColor(0x22c55e)
                .setTitle('🎟️ Wochenlotterie – Ziehung!')
                .setDescription(`🏆 **${p.username}** gewinnt den Pot von **${p.pot} 🪙 ACLS-Coins**!`)
                .addFields({ name: '📊 Statistik', value: `${p.totalTickets} Lose von ${p.players} Spieler${p.players !== 1 ? 'n' : ''} · Gewinnchance: ${Math.round(p.tickets / p.totalTickets * 100)}%` })
                .setFooter({ text: 'Neue Lose gibt es ab Montag im Coin-Shop auf der Website' })
                .setTimestamp();
              await ch.send({ embeds: [embed] });
            } catch (e) { console.error('[Bot] Lotterie-Kanal Fehler:', e.message); }
          }
        }
        if (n.type === 'tournament') {
          const medals = ['🥇', '🥈', '🥉'];
          const lines = (p.top || []).map(t => `${medals[t.place - 1] || t.place + '.'} **${t.username}** – ${Number(t.score).toLocaleString('de-DE')} Punkte (+${t.prize} 🪙)`).join('\n');
          if (n.discord_id) {
            try {
              const u = await client.users.fetch(n.discord_id);
              await u.send(`🏆 Glückwunsch! Du hast das **Wochenturnier** (${p.game}, KW ${p.week}) gewonnen!`);
            } catch (_) {}
          }
          if (TOURNAMENT_CHANNEL_ID) {
            try {
              const ch = await client.channels.fetch(TOURNAMENT_CHANNEL_ID);
              const embed = new EmbedBuilder()
                .setColor(0xfbbf24)
                .setTitle(`🏆 Wochenturnier beendet – ${p.game}`)
                .setDescription(lines || 'Keine Teilnehmer')
                .setFooter({ text: `Woche ${p.week} · Nächstes Turnier startet Montag!` });
              await ch.send({ embeds: [embed] });
            } catch (e) { console.error('[Bot] Turnier-Kanal Fehler:', e.message); }
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

// ── Slash-Commands ───────────────────────────────────────────────
const SLASH_COMMANDS = [
  new SlashCommandBuilder().setName('stats').setDescription('Prüfungsstatistiken anzeigen')
    .addStringOption(o => o.setName('mitarbeiter').setDescription('Discord-ID oder Name (leer = eigene Stats)').setRequired(false)),
  new SlashCommandBuilder().setName('ic').setDescription('Deine IC-Zeit diese Woche anzeigen'),
  new SlashCommandBuilder().setName('dienst').setDescription('Wer ist gerade im Dienst?'),
  new SlashCommandBuilder().setName('monatsbericht').setDescription('Prüfungsstatistik dieser Woche und dieses Monats'),
  new SlashCommandBuilder().setName('rangliste').setDescription('Ranglisten anzeigen (Coins, Turnier oder Minispiel)')
    .addStringOption(o => o.setName('liste').setDescription('Welche Rangliste? (leer = Coins der Woche)').setRequired(false)
      .addChoices(
        { name: '🪙 Coins – Top 10 der Woche', value: 'coins' },
        { name: '🏆 Wochenturnier',            value: 'turnier' },
        { name: 'Autorennen',          value: 'race' },
        { name: 'Brick Breaker',       value: 'brick' },
        { name: 'Dead Zone',           value: 'deadzone' },
        { name: 'Snake',               value: 'snake' },
        { name: 'Tetris',              value: 'tetris' },
        { name: 'Book of Ra',          value: 'bookofra' },
        { name: 'Sky Cop',             value: 'skycop' },
        { name: 'Doodle Jump',         value: 'doodlejump' },
        { name: 'Tower Defense',       value: 'towerdefense' },
        { name: '2048',                value: '2048' },
        { name: 'Quiz Survival',       value: 'quiz' },
        { name: 'Abschlepp-Simulator', value: 'tow' },
        { name: 'Blackjack',           value: 'blackjack' },
      )),
  new SlashCommandBuilder().setName('coins').setDescription('Dein ACLS-Coins Kontostand'),
].map(c => c.toJSON());

async function registerSlashCommands() {
  const appId = process.env.DISCORD_CLIENT_ID;
  if (!appId || !process.env.DISCORD_BOT_TOKEN) return;
  try {
    const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN);
    // Global registrieren → erscheint im Bot-Profil überall sichtbar
    await rest.put(Routes.applicationCommands(appId), { body: SLASH_COMMANDS });
    // Zusätzlich Guild-spezifisch für sofortige Verfügbarkeit im Server
    if (GUILD_ID) await rest.put(Routes.applicationGuildCommands(appId, GUILD_ID), { body: SLASH_COMMANDS });
    console.log('[Bot] Slash-Commands registriert (global + guild)');
  } catch (e) { console.error('[Bot] Slash-Command Registrierung Fehler:', e.message); }
}

async function handleInteraction(interaction) {
  console.log(`[Bot] Interaction empfangen: type=${interaction.type} isChatInput=${interaction.isChatInputCommand()} cmd=${interaction.commandName||'?'} user=${interaction.user?.tag||'?'}`);
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;
  console.log(`[Bot] Slash-Command verarbeite: /${commandName} von ${interaction.user.tag}`);
  try {
    await interaction.deferReply();
  } catch (e) {
    console.error('[Bot] deferReply Fehler:', e.message);
    return;
  }

  if (commandName === 'ic') {
    try {
      const res  = await fetch(`${SERVER_URL}/api/ic-stats`, { headers: { 'x-bot-secret': BOT_SECRET } }).catch(() => null);
      const list = res?.ok ? await res.json() : null;
      const mine = list?.find(u => u.discord_id === interaction.user.id);
      if (!mine) return interaction.editReply({ content: 'Kein IC-Zeit-Eintrag gefunden. Bist du im System registriert?' });
      const embed = new EmbedBuilder()
        .setColor(0xf97316)
        .setTitle(`⏱️ IC-Zeit – ${mine.username}`)
        .addFields(
          { name: 'Diese Woche',   value: `${(+mine.week).toFixed(1)}h`,  inline: true },
          { name: 'Dieser Monat',  value: `${(+mine.month).toFixed(1)}h`, inline: true },
          { name: 'Gesamt',        value: `${(+mine.total).toFixed(1)}h`, inline: true },
        ).setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } catch (e) { await interaction.editReply({ content: 'Fehler beim Laden der IC-Zeit.' }); }
  }

  if (commandName === 'dienst') {
    try {
      const res  = await fetch(`${SERVER_URL}/api/active-sessions`, { headers: { 'x-bot-secret': BOT_SECRET } }).catch(() => null);
      const list = res?.ok ? await res.json() : [];
      if (!list.length) return interaction.editReply({ content: 'Aktuell ist kein Mitarbeiter im Dienst.' });
      const embed = new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle('🟢 Mitarbeiter im Dienst')
        .setDescription(list.map(s => `• **${s.username}** – ${s.channelName} (${s.minutesSince} Min)`).join('\n'))
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } catch (e) { await interaction.editReply({ content: 'Fehler beim Abrufen der aktiven Dienste.' }); }
  }

  if (commandName === 'rangliste') {
    const list = interaction.options.getString('liste') || 'coins';
    const medals = ['🥇', '🥈', '🥉'];
    const rankIcon = i => medals[i] || `**${i + 1}.**`;
    try {
      if (list === 'coins') {
        const res = await fetch(`${SERVER_URL}/api/bot/coins-top`, { headers: { 'x-bot-secret': BOT_SECRET } }).catch(() => null);
        const d   = res?.ok ? await res.json() : null;
        if (!d?.week?.length) return interaction.editReply({ content: 'Diese Woche wurden noch keine Coins verdient.' });
        const embed = new EmbedBuilder()
          .setColor(0xfbbf24)
          .setTitle('🪙 ACLS-Coins – Top 10 der Woche')
          .setDescription(d.week.map((r, i) => `${rankIcon(i)} **${r.username || 'Unbekannt'}** — ${(+r.earned).toLocaleString('de-DE')} 🪙`).join('\n'))
          .setFooter({ text: 'Verdient seit Montag · Coins gibt es in allen Minispielen auf der Website' })
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }
      if (list === 'turnier') {
        const res = await fetch(`${SERVER_URL}/api/bot/tournament`, { headers: { 'x-bot-secret': BOT_SECRET } }).catch(() => null);
        const d   = res?.ok ? await res.json() : null;
        if (!d) return interaction.editReply({ content: 'Turnierdaten konnten nicht geladen werden.' });
        const board = d.leaderboard.length
          ? d.leaderboard.map((r, i) => `${rankIcon(i)} **${r.username || 'Unbekannt'}** — ${(+r.score).toLocaleString('de-DE')}${i < 3 ? ` (+${d.prizes[i]} 🪙)` : ''}`).join('\n')
          : '_Noch keine Teilnehmer – sei der Erste!_';
        const embed = new EmbedBuilder()
          .setColor(0xf97316)
          .setTitle(`🏆 Wochenturnier – ${d.gameName}`)
          .setDescription(board)
          .addFields({ name: '🎁 Preise', value: `🥇 ${d.prizes[0]} · 🥈 ${d.prizes[1]} · 🥉 ${d.prizes[2]} ACLS-Coins`, inline: false })
          .setFooter({ text: 'Bester Score der Woche zählt · Auswertung Sonntag 20:00 Uhr' })
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }
      // Minispiel-Rangliste
      const res  = await fetch(`${SERVER_URL}/api/game-scores/${list}`).catch(() => null);
      const data = res?.ok ? await res.json() : [];
      if (!data.length) return interaction.editReply({ content: 'Noch keine Einträge in dieser Rangliste.' });
      const embed = new EmbedBuilder()
        .setColor(0xfbbf24)
        .setTitle(`🏆 Rangliste – ${list}`)
        .setDescription(data.slice(0, 10).map((r, i) => `${rankIcon(i)} **${r.username || 'Unbekannt'}** — ${r.score.toLocaleString('de-DE')}`).join('\n'))
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } catch (e) { await interaction.editReply({ content: 'Fehler beim Laden der Rangliste.' }); }
  }

  if (commandName === 'coins') {
    try {
      const res = await fetch(`${SERVER_URL}/api/bot/coins/${interaction.user.id}`, { headers: { 'x-bot-secret': BOT_SECRET } }).catch(() => null);
      const d   = res?.ok ? await res.json() : null;
      if (!d) return interaction.editReply({ content: 'Kontostand konnte nicht geladen werden.' });
      const embed = new EmbedBuilder()
        .setColor(0xfbbf24)
        .setTitle(`🪙 ACLS-Coins – ${interaction.member?.displayName || interaction.user.username}`)
        .addFields(
          { name: 'Kontostand',        value: `**${(+d.balance).toLocaleString('de-DE')}** 🪙`, inline: true },
          { name: 'Diese Woche',       value: `+${(+d.weekEarned).toLocaleString('de-DE')}`, inline: true },
          { name: 'Insgesamt verdient', value: `${(+d.totalEarned).toLocaleString('de-DE')}`, inline: true },
        )
        .setFooter({ text: d.rank ? `Platz ${d.rank} der Allzeit-Rangliste · Coins verdienen: Minispiele auf der Website` : 'Spiel ein Minispiel auf der Website, um Coins zu verdienen!' })
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } catch (e) { await interaction.editReply({ content: 'Fehler beim Laden des Kontostands.' }); }
  }

  if (commandName === 'stats') {
    const query = interaction.options.getString('mitarbeiter') || interaction.user.id;
    console.log(`[Bot] /stats query: "${query}"`);
    try {
      const usersRes = await fetch(`${SERVER_URL}/api/users`, { headers: { 'x-bot-secret': BOT_SECRET } }).catch(e => { console.error('[Bot] /api/users Fehler:', e.message); return null; });
      const users    = usersRes?.ok ? await usersRes.json() : [];
      console.log(`[Bot] /stats users geladen: ${users.length}, Status: ${usersRes?.status}`);
      const target   = users.find(u => u.discord_id === query || u.username.toLowerCase().includes(query.toLowerCase()));
      console.log(`[Bot] /stats target: ${target ? target.username : 'NICHT GEFUNDEN'}`);
      if (!target) return interaction.editReply({ content: `❌ Mitarbeiter "${query}" nicht gefunden.` });
      const res  = await fetch(`${SERVER_URL}/api/profile/${target.id}`, { headers: { 'x-bot-secret': BOT_SECRET } }).catch(() => null);
      const d    = res?.ok ? await res.json() : null;
      if (!d) return interaction.editReply({ content: 'Profil konnte nicht geladen werden.' });
      const s = d.stats;
      const embed = new EmbedBuilder()
        .setColor(0xf97316)
        .setTitle(`📋 Stats – ${d.user.username}`)
        .addFields(
          { name: 'Prüfungen abgenommen', value: `${s.conducted}`, inline: true },
          { name: 'MdW-Titel',            value: `${s.eow_wins}`,  inline: true },
          { name: 'IC-Zeit gesamt',        value: `${(+s.ic_total).toFixed(1)}h`, inline: true },
          { name: 'IC-Zeit Woche',         value: `${(+s.ic_week).toFixed(1)}h`,  inline: true },
          { name: 'Rang',                  value: d.user.rank || '—', inline: true },
        ).setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } catch (e) {
      console.error('[Bot] /stats Fehler:', e.message);
      await interaction.editReply({ content: 'Fehler beim Laden der Statistiken.' }).catch(() => {});
    }
  }

  if (commandName === 'monatsbericht') {
    try {
      const res = await fetch(`${SERVER_URL}/api/monatsbericht`, { headers: { 'x-bot-secret': BOT_SECRET } }).catch(() => null);
      if (!res?.ok) return interaction.editReply({ content: '❌ Daten konnten nicht geladen werden.' });
      const d = await res.json();
      const pct = (c, p) => c > 0 ? ` (${Math.round((p||0)/c*100)}% bestanden)` : '';
      const now = new Date();
      const monat = now.toLocaleString('de-DE', { month: 'long', year: 'numeric' });
      const embed = new EmbedBuilder()
        .setColor(0xa855f7)
        .setTitle(`📊 Monatsbericht – ${monat}`)
        .addFields(
          { name: '📅 Diese Woche',  value: `**${d.week.c}** Prüfungen${pct(d.week.c, d.week.p)}`,  inline: true },
          { name: '📆 Dieser Monat', value: `**${d.month.c}** Prüfungen${pct(d.month.c, d.month.p)}`, inline: true },
          { name: '📈 Gesamt',       value: `**${d.total.c}** Prüfungen${pct(d.total.c, d.total.p)}`, inline: true },
        );
      if (d.byExaminer?.length) {
        embed.addFields({ name: '👮 Top Prüfer (Monat)', value: d.byExaminer.map((e,i) => `${i+1}. **${e.username}** — ${e.c} Prüfungen${pct(e.c, e.p)}`).join('\n'), inline: false });
      }
      if (d.byCategory?.length) {
        embed.addFields({ name: '📋 Nach Kategorie (Monat)', value: d.byCategory.map(c => `• **${c.name}**: ${c.c}×${pct(c.c, c.p)}`).join('\n'), inline: false });
      }
      if (d.icWeek?.length) {
        embed.addFields({ name: '⏱️ Top IC-Zeit (Woche)', value: d.icWeek.map((u,i) => `${i+1}. **${u.username}** — ${(+u.h).toFixed(1)}h`).join('\n'), inline: false });
      }
      embed.setTimestamp().setFooter({ text: 'ACLS Automobil Club Los Santos' });
      await interaction.editReply({ embeds: [embed] });
    } catch (e) {
      console.error('[Bot] /monatsbericht Fehler:', e.message);
      await interaction.editReply({ content: '❌ Fehler beim Laden des Monatsberichts.' }).catch(() => {});
    }
  }
}

// ── EOW-Freitags-Erinnerung (18:00 Berliner Zeit) ────────────────
async function sendEowReminder() {
  if (!EOW_CHANNEL_ID) {
    console.warn('[Bot] EOW-Erinnerung: EOW_CHANNEL_ID nicht gesetzt');
    return;
  }
  try {
    const res    = await fetch(`${SERVER_URL}/api/bot/eow-standings`, { headers: { 'x-bot-secret': BOT_SECRET } });
    const data   = res.ok ? await res.json() : { standings: [], totalVotes: 0 };
    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
    const standingsText = data.standings.length
      ? data.standings.map((s, i) => `${medals[i]} **${s.username}** — ${s.votes} Stimme${s.votes !== 1 ? 'n' : ''}`).join('\n')
      : '_Noch keine Stimmen abgegeben_';
    const embed = new EmbedBuilder()
      .setColor(0xf59e0b)
      .setTitle('🗳️ Abstimmung läuft — Mitarbeiter der Woche!')
      .setDescription('Stimme jetzt für den besten Mitarbeiter dieser Woche!\nDie Abstimmung endet **Sonntag um 18:00 Uhr**.')
      .addFields(
        { name: '📊 Aktuelle Führung', value: standingsText },
        { name: '🗳️ Stimmen gesamt', value: `${data.totalVotes} Stimme${data.totalVotes !== 1 ? 'n' : ''}` },
      )
      .setFooter({ text: 'Abstimmen auf der ACLS-Website' })
      .setTimestamp();
    const ch = await client.channels.fetch(EOW_CHANNEL_ID);
    await ch.send({ embeds: [embed] });
    console.log('[Bot] Freitags-EOW-Erinnerung gesendet');
  } catch (e) {
    console.error('[Bot] Freitags-Erinnerung Fehler:', e.message);
  }
}

// Jeden Freitag um 18:00 Berliner Zeit
cron.schedule('0 18 * * 5', sendEowReminder, { timezone: 'Europe/Berlin' });

// ── Turnier-Endspurt: Freitag 18:05 (direkt nach der MdW-Erinnerung) ──
async function sendTournamentSprint() {
  if (!EOW_CHANNEL_ID) return;
  try {
    const res = await fetch(`${SERVER_URL}/api/bot/tournament`, { headers: { 'x-bot-secret': BOT_SECRET } }).catch(() => null);
    const d   = res?.ok ? await res.json() : null;
    if (!d) return;
    const medals = ['🥇', '🥈', '🥉'];
    const board = d.leaderboard.length
      ? d.leaderboard.slice(0, 5).map((r, i) => `${medals[i] || `**${i + 1}.**`} **${r.username || 'Unbekannt'}** — ${(+r.score).toLocaleString('de-DE')}`).join('\n')
      : '_Noch keine Teilnehmer — deine Chance auf 500 Coins!_';
    const embed = new EmbedBuilder()
      .setColor(0xf97316)
      .setTitle(`🏁 Turnier-Endspurt – ${d.gameName}`)
      .setDescription(`Das Wochenturnier endet **Sonntag um 20:00 Uhr**!\n\n${board}`)
      .addFields({ name: '🎁 Preise', value: `🥇 ${d.prizes[0]} · 🥈 ${d.prizes[1]} · 🥉 ${d.prizes[2]} ACLS-Coins` })
      .setFooter({ text: 'Bester Score zählt – jetzt auf der Website spielen!' })
      .setTimestamp();
    const ch = await client.channels.fetch(EOW_CHANNEL_ID);
    await ch.send({ embeds: [embed] });
    console.log('[Bot] Turnier-Endspurt gesendet');
  } catch (e) { console.error('[Bot] Turnier-Endspurt Fehler:', e.message); }
}
cron.schedule('5 18 * * 5', sendTournamentSprint, { timezone: 'Europe/Berlin' });

// ── Automatischer Wochenbericht: Montag 18:00 → Bot-Channel ──────
async function sendWochenbericht() {
  const channelId = COMMANDS_CHANNEL_ID || EOW_CHANNEL_ID;
  if (!channelId) return;
  try {
    const [res, sumRes] = await Promise.all([
      fetch(`${SERVER_URL}/api/monatsbericht`,      { headers: { 'x-bot-secret': BOT_SECRET } }).catch(() => null),
      fetch(`${SERVER_URL}/api/bot/weekly-summary`, { headers: { 'x-bot-secret': BOT_SECRET } }).catch(() => null),
    ]);
    if (!res?.ok) return;
    const d   = await res.json();
    const sum = sumRes?.ok ? await sumRes.json() : null;
    const pct = (c, p) => c > 0 ? ` (${Math.round((p||0)/c*100)}% bestanden)` : '';
    const now = new Date();
    const monat = now.toLocaleString('de-DE', { month: 'long', year: 'numeric' });
    const embed = new EmbedBuilder()
      .setColor(0xa855f7)
      .setTitle(`📊 Wochenbericht – ${monat}`)
      .setDescription('Hier die Zusammenfassung der letzten Woche beim ACLS:')
      .addFields(
        { name: '📅 Letzte Woche',  value: `**${d.week.c}** Prüfungen${pct(d.week.c, d.week.p)}`,   inline: true },
        { name: '📆 Dieser Monat', value: `**${d.month.c}** Prüfungen${pct(d.month.c, d.month.p)}`, inline: true },
        { name: '📈 Gesamt',       value: `**${d.total.c}** Prüfungen${pct(d.total.c, d.total.p)}`, inline: true },
      );
    if (sum?.eow)        embed.addFields({ name: '🌟 Mitarbeiter der Woche', value: `**${sum.eow.username}** mit ${sum.eow.vote_count} Stimmen`, inline: true });
    if (sum?.tournament) embed.addFields({ name: '🏆 Turniersieger',         value: `**${sum.tournament.winner_username || '–'}** (${sum.tournament.gameName}${sum.tournament.winner_score != null ? `, ${(+sum.tournament.winner_score).toLocaleString('de-DE')} Punkte` : ''})`, inline: true });
    if (sum)             embed.addFields({ name: '📨 Neue Bewerbungen',      value: `**${sum.applications}** in den letzten 7 Tagen`, inline: true });
    if (sum?.coinsTop?.length) {
      embed.addFields({ name: '🪙 Top Coin-Verdiener (Woche)', value: sum.coinsTop.map((c, i) => `${['🥇','🥈','🥉'][i]} **${c.username}** — ${(+c.earned).toLocaleString('de-DE')} 🪙`).join('\n'), inline: false });
    }
    if (d.byExaminer?.length) {
      embed.addFields({ name: '🏅 Top Prüfer (Monat)', value: d.byExaminer.slice(0,5).map((e,i) => `${['🥇','🥈','🥉','4️⃣','5️⃣'][i]} **${e.username}** — ${e.c} Prüfungen${pct(e.c,e.p)}`).join('\n'), inline: false });
    }
    if (d.icWeek?.length) {
      embed.addFields({ name: '⏱️ Meiste IC-Zeit (letzte Woche)', value: d.icWeek.map((u,i) => `${i+1}. **${u.username}** — ${(+u.h).toFixed(1)}h`).join('\n'), inline: false });
    }
    embed.setTimestamp().setFooter({ text: 'ACLS Automobil Club Los Santos · Automatischer Wochenbericht' });
    const ch = await client.channels.fetch(channelId);
    // Alten Wochenbericht entfernen, damit immer nur der aktuelle steht
    try {
      const msgs = await ch.messages.fetch({ limit: 50 });
      const old = msgs.filter(m => !m.pinned && m.author?.id === client.user.id && m.embeds[0]?.title?.startsWith('📊 Wochenbericht'));
      for (const [, m] of old) await m.delete().catch(() => {});
    } catch {}
    await ch.send({ embeds: [embed] });
    console.log('[Bot] Automatischer Wochenbericht gesendet');
  } catch (e) {
    console.error('[Bot] Wochenbericht Fehler:', e.message);
  }
}

// Jeden Montag um 18:00 Berliner Zeit
cron.schedule('0 18 * * 1', sendWochenbericht, { timezone: 'Europe/Berlin' });

// ── Befehls-Kanal: Embed posten + alle 5 Min clearen ─────────────
function buildCommandsEmbed() {
  return new EmbedBuilder()
    .setColor(0xf97316)
    .setTitle('📋 Bot-Befehle — Automobil Club Los Santos')
    .setDescription('Alle verfügbaren Slash-Commands des ACLS-Bots:')
    .addFields(
      { name: '`/stats [mitarbeiter]`',  value: 'Prüfungsstatistiken eines Mitarbeiters anzeigen.\nOhne Angabe werden deine eigenen Stats gezeigt.', inline: false },
      { name: '`/ic`',                   value: 'Deine IC-Zeit dieser Woche, dieses Monats und gesamt.', inline: false },
      { name: '`/dienst`',               value: 'Zeigt welche Mitarbeiter gerade im Voice-Kanal aktiv sind.', inline: false },
      { name: '`/rangliste [liste]`',    value: 'Top-10 Ranglisten: 🪙 Coins der Woche (Standard) · 🏆 Wochenturnier · alle Minispiele.', inline: false },
      { name: '`/coins`',                value: 'Dein ACLS-Coins Kontostand, Wochenverdienst und Allzeit-Platzierung.', inline: false },
      { name: '`/monatsbericht`',        value: 'Prüfungsstatistik dieser Woche und dieses Monats + Top Prüfer.', inline: false },
    )
    .setFooter({ text: 'ACLS Bot · Befehle werden laufend erweitert' });
}

async function setupCommandsChannel() {
  if (!COMMANDS_CHANNEL_ID) return;
  try {
    const ch = await client.channels.fetch(COMMANDS_CHANNEL_ID);
    if (!ch) return;

    // Bestehende angepinnte Bot-Nachricht still aktualisieren (kein neuer
    // Post bei jedem Neustart → keine Benachrichtigung für die User)
    const recent = await ch.messages.fetch({ limit: 100 }).catch(() => null);
    const existing = recent?.find(m => m.pinned && m.author.id === client.user.id && m.embeds[0]?.title?.startsWith('📋 Bot-Befehle'));
    if (existing) {
      await existing.edit({ embeds: [buildCommandsEmbed()] }).catch(() => {});
      console.log('[Bot] Befehls-Embed still aktualisiert (kein Neupost)');
      return;
    }

    // Erste Einrichtung: Kanal leeren, Embed posten und anpinnen
    const msgs = await ch.messages.fetch({ limit: 100 });
    if (msgs.size > 0) await ch.bulkDelete(msgs, true).catch(() => {});
    const msg = await ch.send({ embeds: [buildCommandsEmbed()] });
    await msg.pin().catch(() => {});
    console.log('[Bot] Befehls-Kanal eingerichtet');
  } catch (e) { console.error('[Bot] Befehls-Kanal Fehler:', e.message); }
}

// Nachrichten, die der 5-Minuten-Cleaner NICHT löschen darf
function isProtectedMessage(m) {
  if (m.pinned) return true;
  // Wochenzusammenfassung bleibt bis zum nächsten Montags-Post stehen
  return m.author?.id === client.user.id && m.embeds[0]?.title?.startsWith('📊 Wochenbericht');
}

async function clearCommandsChannel() {
  if (!COMMANDS_CHANNEL_ID) return;
  try {
    const ch   = await client.channels.fetch(COMMANDS_CHANNEL_ID);
    if (!ch) return;
    const msgs = await ch.messages.fetch({ limit: 100 });
    const toDelete = msgs.filter(m => !isProtectedMessage(m));
    if (toDelete.size > 0) await ch.bulkDelete(toDelete, true).catch(() => {});
  } catch (e) { /* Kanal nicht erreichbar, ignorieren */ }
}

// Alle 5 Minuten nicht-angeheftete Nachrichten löschen
cron.schedule('*/5 * * * *', clearCommandsChannel);

client.on(Events.InteractionCreate, handleInteraction);

// Raw-Logger: sehen ob Discord überhaupt Interaction-Events schickt
client.on('raw', (data) => {
  if (data.t === 'INTERACTION_CREATE') {
    console.log(`[Bot] RAW INTERACTION_CREATE: type=${data.d?.type} cmd=${data.d?.data?.name||'?'} user=${data.d?.member?.user?.username||data.d?.user?.username||'?'}`);
  }
});

client.once(Events.ClientReady, async c => {
  console.log(`[Bot] Eingeloggt als ${c.user.tag}`);
  await registerSlashCommands();
  await setupCommandsChannel();
  console.log(`[Bot] IC-Schlüsselwörter: ${IC_KEYWORDS.join(', ')}`);
  console.log(`[Bot] Alle Kanäle tracken: ${TRACK_ALL}`);
  console.log(`[Bot] Badge-Kanal: ${BADGE_CHANNEL_ID || 'nicht konfiguriert'}`);
  console.log(`[Bot] EoW-Kanal:   ${EOW_CHANNEL_ID   || 'nicht konfiguriert'}`);

  // Beim Start alle bereits im Channel sitzenden Mitglieder ins Tracking aufnehmen
  if (GUILD_ID) {
    try {
      // Gecachte Guild nutzen (enthält Voice-States aus GUILD_CREATE).
      // force:true würde per REST fetchen und die Voice-States NICHT mitholen.
      const guild = client.guilds.cache.get(GUILD_ID) || await client.guilds.fetch(GUILD_ID);
      await guild.members.fetch(); // Member-Cache füllen für displayName
      let found = 0;
      for (const [userId, vs] of guild.voiceStates.cache) {
        if (userId === client.user.id) continue;
        if (!vs.channel || !isIcChannel(vs.channel.name)) continue;
        const joinedAt = new Date();
        const member   = vs.member;
        activeSessions.set(userId, { channelId: vs.channelId, channelName: vs.channel.name, joinedAt });
        fetch(`${SERVER_URL}/api/active-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bot_secret: BOT_SECRET, discord_id: userId, username: member?.displayName || userId, channel_name: vs.channel.name, joined_at: joinedAt.toISOString() }),
        }).catch(() => {});
        setDutyRole(member, true);
        found++;
      }
      // Dienst-Rolle bei allen entfernen, die nicht (mehr) im Dienst-Channel sind
      const dutyRole = guild.roles.cache.find(r => r.name === DUTY_ROLE_NAME);
      if (dutyRole) {
        for (const [, m] of dutyRole.members) {
          if (!activeSessions.has(m.id)) setDutyRole(m, false);
        }
      }
      console.log(`[Bot] Startup-Scan: ${found} Mitglied(er) bereits im Dienst-Channel – Tracking gestartet`);
    } catch (e) { console.error('[Bot] Startup-Scan Fehler:', e.message); }
  } else {
    console.warn('[Bot] GUILD_ID nicht gesetzt – Startup-Scan übersprungen!');
  }

  setInterval(pollNotifications, 30_000);
});

// ── „Im Dienst"-Rolle: automatisch bei IC-Voice-Join/-Leave ──────
const DUTY_ROLE_NAME = process.env.DUTY_ROLE_NAME || 'Im Dienst';
async function setDutyRole(member, on) {
  if (!member || member.user?.bot) return;
  try {
    const guild = member.guild;
    let role = guild.roles.cache.find(r => r.name === DUTY_ROLE_NAME);
    if (!role && on) {
      role = await guild.roles.create({ name: DUTY_ROLE_NAME, color: 0x22c55e, mentionable: false, reason: 'ACLS Dienst-Status (automatisch erstellt)' }).catch(e => {
        console.error('[Bot] Dienst-Rolle erstellen fehlgeschlagen:', e.message);
        return null;
      });
    }
    if (!role) return;
    if (on  && !member.roles.cache.has(role.id)) await member.roles.add(role).catch(e => console.error('[Bot] Dienst-Rolle vergeben:', e.message));
    if (!on &&  member.roles.cache.has(role.id)) await member.roles.remove(role).catch(e => console.error('[Bot] Dienst-Rolle entfernen:', e.message));
  } catch (e) { console.error('[Bot] Dienst-Rolle Fehler:', e.message); }
}

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
      setDutyRole(oldState.member || newState.member, false);
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
      setDutyRole(newState.member, true);
    }
  }
});


// ── Text-Command-Handler (Fallback für !stats / .stats) ──────────
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim();
  const match = content.match(/^[!/.]stats(?:\s+(.+))?$/i);
  if (!match) return;
  console.log(`[Bot] Text-Command !stats von ${message.author.tag}: "${content}"`);

  const query = (match[1] || '').trim() || message.author.id;
  try {
    const usersRes = await fetch(`${SERVER_URL}/api/users`, { headers: { 'x-bot-secret': BOT_SECRET } }).catch(() => null);
    const users    = usersRes?.ok ? await usersRes.json() : [];
    const target   = users.find(u => u.discord_id === query || u.username.toLowerCase().includes(query.toLowerCase()));
    if (!target) return message.reply(`❌ Mitarbeiter "${query}" nicht gefunden.`);
    const res = await fetch(`${SERVER_URL}/api/profile/${target.id}`, { headers: { 'x-bot-secret': BOT_SECRET } }).catch(() => null);
    const d   = res?.ok ? await res.json() : null;
    if (!d) return message.reply('❌ Profil konnte nicht geladen werden.');
    const s = d.stats;
    const embed = new EmbedBuilder()
      .setColor(0xf97316)
      .setTitle(`📋 Stats – ${d.user.username}`)
      .addFields(
        { name: 'Prüfungen abgenommen', value: `${s.conducted}`,               inline: true },
        { name: 'MdW-Titel',            value: `${s.eow_wins}`,                 inline: true },
        { name: 'IC-Zeit gesamt',        value: `${(+s.ic_total).toFixed(1)}h`, inline: true },
        { name: 'IC-Zeit Woche',         value: `${(+s.ic_week).toFixed(1)}h`,  inline: true },
        { name: 'Rang',                  value: d.user.rank || '—',             inline: true },
      ).setTimestamp();
    await message.reply({ embeds: [embed] });
  } catch (e) {
    console.error('[Bot] !stats Fehler:', e.message);
    await message.reply('❌ Fehler beim Laden der Statistiken.').catch(() => {});
  }
});

// ── Hilfsfunktion: Mod-Log senden ────────────────────────────────
async function sendModLog(embed) {
  if (!MOD_LOG_CHANNEL_ID) return;
  try {
    const ch = await client.channels.fetch(MOD_LOG_CHANNEL_ID);
    if (ch) await ch.send({ embeds: [embed] });
  } catch (e) { console.error('[Bot] Mod-Log Fehler:', e.message); }
}

// ── Auto-Rolle: Neues Mitglied bekommt ACLS Member ───────────────
client.on(Events.GuildMemberAdd, async (member) => {
  if (GUILD_ID && member.guild.id !== GUILD_ID) return;
  try {
    const role = member.guild.roles.cache.find(r => r.name === AUTO_ROLE_NAME)
              || (await member.guild.roles.fetch()).find(r => r.name === AUTO_ROLE_NAME);
    if (!role) { console.warn(`[Bot] Auto-Rolle "${AUTO_ROLE_NAME}" nicht gefunden!`); return; }
    await member.roles.add(role);
    console.log(`[Bot] Auto-Rolle "${AUTO_ROLE_NAME}" vergeben an ${member.user.tag}`);
    await sendModLog(new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle('👋 Neues Mitglied')
      .setDescription(`<@${member.id}> ist dem Server beigetreten`)
      .addFields({ name: 'Rolle vergeben', value: `\`${AUTO_ROLE_NAME}\``, inline: true })
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp());
  } catch (e) { console.error('[Bot] Auto-Rolle Fehler:', e.message); }
});

// ── Mod-Log: Rollenänderung ───────────────────────────────────────
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  if (GUILD_ID && newMember.guild.id !== GUILD_ID) return;

  // Rollen-Diff
  const added   = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
  const removed = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));

  if (added.size > 0 || removed.size > 0) {
    const embed = new EmbedBuilder()
      .setColor(0x60a5fa)
      .setTitle('🔧 Rollenänderung')
      .setDescription(`<@${newMember.id}> **${newMember.displayName}**`)
      .setThumbnail(newMember.user.displayAvatarURL())
      .setTimestamp();
    if (added.size > 0)   embed.addFields({ name: '✅ Hinzugefügt',  value: added.map(r => `\`${r.name}\``).join(', '),   inline: false });
    if (removed.size > 0) embed.addFields({ name: '❌ Entfernt',     value: removed.map(r => `\`${r.name}\``).join(', '), inline: false });
    embed.setFooter({ text: `User-ID: ${newMember.id}` });
    await sendModLog(embed);
  }

  // Nickname-Änderung
  const oldNick = oldMember.nickname || oldMember.user.globalName || oldMember.user.username;
  const newNick = newMember.nickname || newMember.user.globalName || newMember.user.username;
  if (oldNick !== newNick) {
    await sendModLog(new EmbedBuilder()
      .setColor(0xf59e0b)
      .setTitle('✏️ Nickname geändert')
      .setDescription(`<@${newMember.id}>`)
      .setThumbnail(newMember.user.displayAvatarURL())
      .addFields(
        { name: 'Vorher', value: oldNick || '–', inline: true },
        { name: 'Nachher', value: newNick || '–', inline: true },
      )
      .setFooter({ text: `User-ID: ${newMember.id}` })
      .setTimestamp());
    try {
      await fetch(`${SERVER_URL}/api/sync-member`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_secret: BOT_SECRET, discord_id: newMember.id, username: newNick, avatar: newMember.user.avatar }),
      });
    } catch {}
  }

  // Server-spezifisches Profilbild geändert
  if (oldMember.avatar !== newMember.avatar) {
    const embed = new EmbedBuilder()
      .setColor(0xa855f7)
      .setTitle('🖼️ Server-Profilbild geändert')
      .setDescription(`<@${newMember.id}> **${newMember.displayName}**`)
      .setFooter({ text: `User-ID: ${newMember.id}` })
      .setTimestamp();
    if (newMember.avatar) embed.setThumbnail(newMember.displayAvatarURL({ size: 256 }));
    await sendModLog(embed);
  }

  // Timeout (Stummschalten) geändert
  const oldT = oldMember.communicationDisabledUntilTimestamp;
  const newT = newMember.communicationDisabledUntilTimestamp;
  if (oldT !== newT) {
    const isAdded = newT && newT > Date.now();
    const embed = new EmbedBuilder()
      .setColor(isAdded ? 0xef4444 : 0x22c55e)
      .setTitle(isAdded ? '🔇 Timeout verhängt' : '🔊 Timeout aufgehoben')
      .setDescription(`<@${newMember.id}> **${newMember.displayName}**`)
      .setThumbnail(newMember.user.displayAvatarURL())
      .setFooter({ text: `User-ID: ${newMember.id}` })
      .setTimestamp();
    if (isAdded) embed.addFields({ name: 'Bis', value: `<t:${Math.floor(newT / 1000)}:F>`, inline: true });
    await sendModLog(embed);
  }
});

// ── Mod-Log: Nachricht gelöscht ───────────────────────────────────
client.on(Events.MessageDelete, async (message) => {
  if (!message.guild) return;
  if (GUILD_ID && message.guild.id !== GUILD_ID) return;
  if (message.author?.bot) return;
  try { if (message.channel.id === MOD_LOG_CHANNEL_ID) return; } catch {}

  // Audit-Log kurz abwarten damit Discord es eingetragen hat
  let deletedBy = null;
  try {
    await new Promise(r => setTimeout(r, 1200));
    const logs = await message.guild.fetchAuditLogs({ type: AuditLogEvent.MessageDelete, limit: 1 });
    const entry = logs.entries.first();
    if (entry && Date.now() - entry.createdTimestamp < 6000 &&
        (!message.author || entry.target?.id === message.author.id)) {
      deletedBy = entry.executor;
    }
  } catch {}

  const authorTag  = message.author ? `<@${message.author.id}> (${message.author.tag})` : '*(unbekannt)*';
  const channelTag = message.channel?.name ? `#${message.channel.name}` : '?';

  const embed = new EmbedBuilder()
    .setColor(0xef4444)
    .setTitle('🗑️ Nachricht gelöscht')
    .setDescription(`In <#${message.channel.id}> von ${authorTag}`)
    .setTimestamp();

  embed.addFields({
    name: 'Inhalt',
    value: message.content?.slice(0, 1024) || '*(nicht gecacht – Nachricht zu alt)*',
    inline: false,
  });

  if (message.attachments?.size > 0) {
    embed.addFields({ name: 'Anhänge', value: [...message.attachments.values()].map(a => a.url).join('\n').slice(0, 512), inline: false });
  }

  if (deletedBy) {
    embed.addFields({ name: 'Gelöscht von', value: `<@${deletedBy.id}> (${deletedBy.tag})`, inline: true });
  }

  embed.setFooter({ text: `User-ID: ${message.author?.id || '?'} · Kanal: ${channelTag}` });

  await sendModLog(embed);
});

// ── Mod-Log: Nachricht bearbeitet ────────────────────────────────
client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (!newMessage.guild) return;
  if (GUILD_ID && newMessage.guild.id !== GUILD_ID) return;
  if (newMessage.author?.bot) return;
  try { if (newMessage.channel.id === MOD_LOG_CHANNEL_ID) return; } catch {}
  if (!oldMessage.content && !newMessage.content) return;
  if (oldMessage.content === newMessage.content) return;
  // Partials: Nachricht ggf. nachladen
  if (newMessage.partial) { try { await newMessage.fetch(); } catch { return; } }

  await sendModLog(new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle('✏️ Nachricht bearbeitet')
    .setDescription(`In <#${newMessage.channel.id}> von <@${newMessage.author?.id}>  [→ Springe zur Nachricht](${newMessage.url})`)
    .addFields(
      { name: 'Vorher', value: (oldMessage.content || '–').slice(0, 512), inline: false },
      { name: 'Nachher', value: (newMessage.content || '–').slice(0, 512), inline: false },
    )
    .setFooter({ text: `User-ID: ${newMessage.author?.id}` })
    .setTimestamp());
});

// ── Mod-Log: Globales Profilbild / Username geändert ─────────────
client.on(Events.UserUpdate, async (oldUser, newUser) => {
  if (newUser.bot) return;
  if (GUILD_ID) {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild?.members.cache.has(newUser.id)) return;
  }

  // Profilbild geändert
  if (oldUser.avatar !== newUser.avatar) {
    const embed = new EmbedBuilder()
      .setColor(0xa855f7)
      .setTitle('🖼️ Profilbild geändert')
      .setDescription(`<@${newUser.id}> **${newUser.username}**`)
      .setThumbnail(newUser.displayAvatarURL({ size: 256 }))
      .setFooter({ text: `User-ID: ${newUser.id}` })
      .setTimestamp();
    if (oldUser.avatar) {
      embed.addFields({ name: 'Altes Bild', value: oldUser.displayAvatarURL({ size: 256 }), inline: false });
    }
    await sendModLog(embed);
  }

  // Username geändert
  if (oldUser.username !== newUser.username) {
    await sendModLog(new EmbedBuilder()
      .setColor(0xf59e0b)
      .setTitle('👤 Username geändert')
      .setDescription(`<@${newUser.id}>`)
      .setThumbnail(newUser.displayAvatarURL())
      .addFields(
        { name: 'Vorher', value: oldUser.username, inline: true },
        { name: 'Nachher', value: newUser.username, inline: true },
      )
      .setFooter({ text: `User-ID: ${newUser.id}` })
      .setTimestamp());
  }
});

// ── Mod-Log: Ban hinzugefügt ──────────────────────────────────────
client.on(Events.GuildBanAdd, async (ban) => {
  if (GUILD_ID && ban.guild.id !== GUILD_ID) return;
  let executor = null;
  try {
    await new Promise(r => setTimeout(r, 800));
    const logs = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
    const entry = logs.entries.first();
    if (entry && Date.now() - entry.createdTimestamp < 5000) executor = entry.executor;
  } catch {}

  const embed = new EmbedBuilder()
    .setColor(0xef4444)
    .setTitle('🔨 Mitglied gebannt')
    .setDescription(`<@${ban.user.id}> **${ban.user.tag}**`)
    .setThumbnail(ban.user.displayAvatarURL())
    .setFooter({ text: `User-ID: ${ban.user.id}` })
    .setTimestamp();
  if (ban.reason) embed.addFields({ name: 'Grund', value: ban.reason, inline: false });
  if (executor)   embed.addFields({ name: 'Gebannt von', value: `<@${executor.id}> (${executor.tag})`, inline: true });
  await sendModLog(embed);
});

// ── Mod-Log: Ban aufgehoben ───────────────────────────────────────
client.on(Events.GuildBanRemove, async (ban) => {
  if (GUILD_ID && ban.guild.id !== GUILD_ID) return;
  let executor = null;
  try {
    await new Promise(r => setTimeout(r, 800));
    const logs = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanRemove, limit: 1 });
    const entry = logs.entries.first();
    if (entry && Date.now() - entry.createdTimestamp < 5000) executor = entry.executor;
  } catch {}

  const embed = new EmbedBuilder()
    .setColor(0x22c55e)
    .setTitle('✅ Ban aufgehoben')
    .setDescription(`<@${ban.user.id}> **${ban.user.tag}**`)
    .setThumbnail(ban.user.displayAvatarURL())
    .setFooter({ text: `User-ID: ${ban.user.id}` })
    .setTimestamp();
  if (executor) embed.addFields({ name: 'Aufgehoben von', value: `<@${executor.id}> (${executor.tag})`, inline: true });
  await sendModLog(embed);
});

// ── Mod-Log: Massenhafte Löschung ────────────────────────────────
client.on(Events.MessageBulkDelete, async (messages, channel) => {
  if (!channel.guild) return;
  if (GUILD_ID && channel.guild.id !== GUILD_ID) return;
  try { if (channel.id === MOD_LOG_CHANNEL_ID) return; } catch {}

  let executor = null;
  try {
    await new Promise(r => setTimeout(r, 800));
    const logs = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.MessageBulkDelete, limit: 1 });
    const entry = logs.entries.first();
    if (entry && Date.now() - entry.createdTimestamp < 5000) executor = entry.executor;
  } catch {}

  const embed = new EmbedBuilder()
    .setColor(0xef4444)
    .setTitle(`🗑️ ${messages.size} Nachrichten gelöscht (Bulk)`)
    .setDescription(`In <#${channel.id}>`)
    .setFooter({ text: `Kanal: #${channel.name}` })
    .setTimestamp();
  if (executor) embed.addFields({ name: 'Ausgeführt von', value: `<@${executor.id}> (${executor.tag})`, inline: true });

  const preview = messages
    .filter(m => m.content)
    .map(m => `**${m.author?.tag || '?'}**: ${m.content.slice(0, 80)}`)
    .slice(0, 5)
    .join('\n');
  if (preview) embed.addFields({ name: 'Vorschau (erste 5)', value: preview, inline: false });

  await sendModLog(embed);
});

// ── Mod-Log: Mitglied verlässt Server ────────────────────────────
client.on(Events.GuildMemberRemove, async (member) => {
  if (GUILD_ID && member.guild.id !== GUILD_ID) return;
  if (member.user.bot) return;

  // Prüfen ob es ein Kick war
  let kickedBy = null;
  try {
    await new Promise(r => setTimeout(r, 800));
    const logs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 });
    const entry = logs.entries.first();
    if (entry && entry.target?.id === member.id && Date.now() - entry.createdTimestamp < 5000) {
      kickedBy = { executor: entry.executor, reason: entry.reason };
    }
  } catch {}

  const roles = member.roles.cache.filter(r => r.name !== '@everyone').map(r => `\`${r.name}\``).join(', ') || '–';
  const embed = new EmbedBuilder()
    .setColor(kickedBy ? 0xef4444 : 0x6b7280)
    .setTitle(kickedBy ? '👢 Mitglied gekickt' : '🚪 Mitglied verlassen')
    .setDescription(`<@${member.id}> **${member.user.tag}**`)
    .setThumbnail(member.user.displayAvatarURL())
    .addFields({ name: 'Rollen', value: roles, inline: false })
    .setFooter({ text: `User-ID: ${member.id}` })
    .setTimestamp();
  if (kickedBy) {
    embed.addFields({ name: 'Gekickt von', value: `<@${kickedBy.executor.id}> (${kickedBy.executor.tag})`, inline: true });
    if (kickedBy.reason) embed.addFields({ name: 'Grund', value: kickedBy.reason, inline: true });
  }
  await sendModLog(embed);
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
