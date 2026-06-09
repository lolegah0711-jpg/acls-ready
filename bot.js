require('dotenv').config();
const { Client, GatewayIntentBits, Events, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const fetch = require('node-fetch');
const cron  = require('node-cron');

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
const IC_LOG_CHANNEL_ID   = process.env.IC_LOG_CHANNEL_ID   || '';
const COMMANDS_CHANNEL_ID = process.env.COMMANDS_CHANNEL_ID || '';
const MOD_LOG_CHANNEL_ID  = process.env.MOD_LOG_CHANNEL_ID  || '1476285851402113182';
const AUTO_ROLE_NAME      = process.env.AUTO_ROLE_NAME       || 'ACLS Member';

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
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
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

// ── Slash-Commands ───────────────────────────────────────────────
const SLASH_COMMANDS = [
  new SlashCommandBuilder().setName('stats').setDescription('Prüfungsstatistiken anzeigen')
    .addStringOption(o => o.setName('mitarbeiter').setDescription('Discord-ID oder Name (leer = eigene Stats)').setRequired(false)),
  new SlashCommandBuilder().setName('ic').setDescription('Deine IC-Zeit diese Woche anzeigen'),
  new SlashCommandBuilder().setName('dienst').setDescription('Wer ist gerade im Dienst?'),
  new SlashCommandBuilder().setName('monatsbericht').setDescription('Prüfungsstatistik dieser Woche und dieses Monats'),
  new SlashCommandBuilder().setName('rangliste').setDescription('Spielrangliste anzeigen')
    .addStringOption(o => o.setName('spiel').setDescription('Spielname').setRequired(true)
      .addChoices(
        { name: 'Book of Ra',    value: 'bookofra' },
        { name: 'Tower Defense', value: 'towerdefense' },
        { name: '2048',          value: '2048' },
      )),
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
    const game = interaction.options.getString('spiel');
    try {
      const res  = await fetch(`${SERVER_URL}/api/game-scores/${game}`).catch(() => null);
      const data = res?.ok ? await res.json() : [];
      if (!data.length) return interaction.editReply({ content: 'Noch keine Einträge in dieser Rangliste.' });
      const medals = ['🥇', '🥈', '🥉'];
      const embed = new EmbedBuilder()
        .setColor(0xfbbf24)
        .setTitle(`🏆 Rangliste – ${game}`)
        .setDescription(data.slice(0,10).map((r,i) => `${medals[i]||`**${i+1}.**`} **${r.username||'Unbekannt'}** — ${r.score.toLocaleString('de-DE')}`).join('\n'))
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } catch (e) { await interaction.editReply({ content: 'Fehler beim Laden der Rangliste.' }); }
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

// ── Automatischer Wochenbericht: Montag 08:00 ────────────────────
async function sendWochenbericht() {
  if (!EOW_CHANNEL_ID) return;
  try {
    const res = await fetch(`${SERVER_URL}/api/monatsbericht`, { headers: { 'x-bot-secret': BOT_SECRET } }).catch(() => null);
    if (!res?.ok) return;
    const d = await res.json();
    const pct = (c, p) => c > 0 ? ` (${Math.round((p||0)/c*100)}% bestanden)` : '';
    const now = new Date();
    const monat = now.toLocaleString('de-DE', { month: 'long', year: 'numeric' });
    const embed = new EmbedBuilder()
      .setColor(0xa855f7)
      .setTitle(`📊 Wochenbericht – ${monat}`)
      .setDescription('Guten Morgen! Hier die aktuellen Statistiken der ACLS Fahrschule:')
      .addFields(
        { name: '📅 Letzte Woche',  value: `**${d.week.c}** Prüfungen${pct(d.week.c, d.week.p)}`,   inline: true },
        { name: '📆 Dieser Monat', value: `**${d.month.c}** Prüfungen${pct(d.month.c, d.month.p)}`, inline: true },
        { name: '📈 Gesamt',       value: `**${d.total.c}** Prüfungen${pct(d.total.c, d.total.p)}`, inline: true },
      );
    if (d.byExaminer?.length) {
      embed.addFields({ name: '🏆 Top Prüfer (Monat)', value: d.byExaminer.slice(0,5).map((e,i) => `${['🥇','🥈','🥉','4️⃣','5️⃣'][i]} **${e.username}** — ${e.c} Prüfungen${pct(e.c,e.p)}`).join('\n'), inline: false });
    }
    if (d.icWeek?.length) {
      embed.addFields({ name: '⏱️ Meiste IC-Zeit (letzte Woche)', value: d.icWeek.map((u,i) => `${i+1}. **${u.username}** — ${(+u.h).toFixed(1)}h`).join('\n'), inline: false });
    }
    embed.setTimestamp().setFooter({ text: 'ACLS Automobil Club Los Santos · Automatischer Wochenbericht' });
    const ch = await client.channels.fetch(EOW_CHANNEL_ID);
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
      { name: '`/rangliste [spiel]`',    value: 'Top-10 Rangliste eines Minispiels.\nSpiele: Book of Ra · Tower Defense · 2048', inline: false },
      { name: '`/monatsbericht`',        value: 'Prüfungsstatistik dieser Woche und dieses Monats + Top Prüfer.', inline: false },
    )
    .setFooter({ text: 'ACLS Bot · Befehle werden laufend erweitert' })
    .setTimestamp();
}

async function setupCommandsChannel() {
  if (!COMMANDS_CHANNEL_ID) return;
  try {
    const ch = await client.channels.fetch(COMMANDS_CHANNEL_ID);
    if (!ch) return;

    // Alle bestehenden Nachrichten löschen
    const msgs = await ch.messages.fetch({ limit: 100 });
    if (msgs.size > 0) await ch.bulkDelete(msgs, true).catch(() => {});

    // Neues Embed posten und anpinnen
    const msg = await ch.send({ embeds: [buildCommandsEmbed()] });
    await msg.pin().catch(() => {});
    console.log('[Bot] Befehls-Kanal eingerichtet');
  } catch (e) { console.error('[Bot] Befehls-Kanal Fehler:', e.message); }
}

async function clearCommandsChannel() {
  if (!COMMANDS_CHANNEL_ID) return;
  try {
    const ch   = await client.channels.fetch(COMMANDS_CHANNEL_ID);
    if (!ch) return;
    const msgs = await ch.messages.fetch({ limit: 100 });
    // Alle nicht-angehefteten Nachrichten löschen
    const toDelete = msgs.filter(m => !m.pinned);
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
        found++;
      }
      console.log(`[Bot] Startup-Scan: ${found} Mitglied(er) bereits im Dienst-Channel – Tracking gestartet`);
    } catch (e) { console.error('[Bot] Startup-Scan Fehler:', e.message); }
  } else {
    console.warn('[Bot] GUILD_ID nicht gesetzt – Startup-Scan übersprungen!');
  }

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
      .setTimestamp();
    if (added.size > 0)   embed.addFields({ name: '✅ Hinzugefügt',  value: added.map(r => `\`${r.name}\``).join(', '),   inline: false });
    if (removed.size > 0) embed.addFields({ name: '❌ Entfernt',     value: removed.map(r => `\`${r.name}\``).join(', '), inline: false });
    await sendModLog(embed);
  }

  // Nickname-Änderung
  const oldName = oldMember.nickname || oldMember.user.globalName || oldMember.user.username;
  const newName = newMember.nickname || newMember.user.globalName || newMember.user.username;
  if (oldName !== newName) {
    await sendModLog(new EmbedBuilder()
      .setColor(0xf59e0b)
      .setTitle('✏️ Nickname geändert')
      .setDescription(`<@${newMember.id}>`)
      .addFields(
        { name: 'Vorher', value: oldName || '–', inline: true },
        { name: 'Nachher', value: newName || '–', inline: true },
      ).setTimestamp());
    // Website-Sync
    try {
      await fetch(`${SERVER_URL}/api/sync-member`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_secret: BOT_SECRET, discord_id: newMember.id, username: newName, avatar: newMember.user.avatar }),
      });
    } catch {}
  }
});

// ── Mod-Log: Nachricht gelöscht ───────────────────────────────────
client.on(Events.MessageDelete, async (message) => {
  if (!message.guild) return;
  if (GUILD_ID && message.guild.id !== GUILD_ID) return;
  if (message.author?.bot) return;
  if (message.channel.id === MOD_LOG_CHANNEL_ID) return; // eigene Logs nicht loggen

  const embed = new EmbedBuilder()
    .setColor(0xef4444)
    .setTitle('🗑️ Nachricht gelöscht')
    .setDescription(`In <#${message.channel.id}> von <@${message.author?.id || '?'}>`)
    .setTimestamp();

  if (message.content) {
    embed.addFields({ name: 'Inhalt', value: message.content.slice(0, 1024) || '–', inline: false });
  }
  if (message.attachments?.size > 0) {
    embed.addFields({ name: 'Anhänge', value: message.attachments.map(a => a.url).join('\n').slice(0, 512), inline: false });
  }
  embed.setFooter({ text: `User-ID: ${message.author?.id || '?'} · Kanal: #${message.channel.name}` });

  await sendModLog(embed);
});

// ── Mod-Log: Nachricht bearbeitet ────────────────────────────────
client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (!newMessage.guild) return;
  if (GUILD_ID && newMessage.guild.id !== GUILD_ID) return;
  if (newMessage.author?.bot) return;
  if (newMessage.channel.id === MOD_LOG_CHANNEL_ID) return;
  if (oldMessage.content === newMessage.content) return;

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
