const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType
} = require('discord.js');
const axios = require('axios');
const { letterFromIndex, getExplanationWithRetry } = require('../../shared-utils');

const COMMAND_NAME = 'astronomy';
const EVENT_NAME = 'Astronomy';
const DIVISIONS = ['C'];
const ALLOWED_SUBTOPICS = ['Solar System','Stars','Galaxies','Cosmology','Instruments'];
const ALLOW_IMAGES = false;

const PRIMARY_BASE = 'https://scio.ly';
const API_KEY = process.env.SCIO_API_KEY;
const AUTH_HEADERS = API_KEY ? { 'X-API-Key': API_KEY, Authorization: `Bearer ${API_KEY}` } : {};
const COLOR_BLUE = 0x2b90d9, COLOR_GREEN = 0x3fbf7f, COLOR_RED = 0xff5555;

function letter(n){return letterFromIndex(n);}
function prune(o){return Object.fromEntries(Object.entries(o).filter(([,v])=>v!=null));}
function resolveCorrectIndex(q){
  const { options=[], answers=[] } = q||{};
  if(!options.length) return null;
  const a0 = answers?.[0];
  if(typeof a0==='number') return a0>=1&&a0<=options.length? a0-1 : (a0>=0&&a0<options.length? a0:0);
  if(typeof a0==='string'){ const t=a0.trim().toLowerCase(); const i=options.findIndex(o=>String(o).trim().toLowerCase()===t); if(i!==-1) return i; }
  return 0;
}
function buildEmbed(q){
  const e=new EmbedBuilder().setColor(COLOR_BLUE).setTitle(EVENT_NAME).setDescription(q.question||'No question text');
  const fields=[];
  if(Array.isArray(q.options)&&q.options.length){
    fields.push({name:'Answer Choices', value:q.options.map((opt,i)=>`**${letter(i)})** ${opt}`).join('\n'), inline:false});
  }
  fields.push(
    {name:'Division', value:String(q.division??'—'), inline:true},
    {name:'Difficulty', value: typeof q.difficulty==='number'?`${Math.round(q.difficulty*100)}%`:'—', inline:true},
    {name:'Subtopic(s)', value: Array.isArray(q.subtopics)&&q.subtopics.length? q.subtopics.join(', '):'None', inline:true},
  );
  e.addFields(fields).setFooter({text:'Use the buttons below.'});
  if(ALLOW_IMAGES){
    if(q.imageData) e.setImage(q.imageData);
    else if(Array.isArray(q.images)&&q.images.length) e.setImage(q.images[0]);
  }
  return e;
}
function buttonsRow(id){
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`check_${id}`).setLabel('Check answer').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`explain_${id}`).setLabel('Explain question').setStyle(ButtonStyle.Secondary),
  );
}
function pickFirst(data){ if(!data) return null; if(Array.isArray(data)) return data[0]||null; if(Array.isArray(data.questions)) return data.questions[0]||null; if(data.id||data.base52||data.question) return data; return null; }

// -------------------- Main Command --------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName(COMMAND_NAME)
    .setDescription(`Get a ${EVENT_NAME} question`)
    .addStringOption(o=>o.setName('question_type').setDescription('Question type').setRequired(false).addChoices({name:'MCQ', value:'mcq'}, {name:'FRQ', value:'frq'}, {name:'ID', value:'id'}))
    .addStringOption(option =>
      option.setName('division').setDescription('Division').addChoices(...DIVISIONS.map(d => ({ name: `Division ${d}`, value: d }))))
    .addStringOption(option =>
      option.setName('difficulty').setDescription('Difficulty').addChoices(
        { name: 'Very Easy (0-19%)', value: 'Very Easy (0-19%)' },
        { name: 'Easy (20-39%)', value: 'Easy (20-39%)' },
        { name: 'Medium (40-59%)', value: 'Medium (40-59%)' },
        { name: 'Hard (60-79%)', value: 'Hard (60-79%)' },
        { name: 'Very Hard (80-100%)', value: 'Very Hard (80-100%)' }
      )
    )
    .addStringOption(option =>
      option.setName('subtopic').setDescription('Subtopic').addChoices(...ALLOWED_SUBTOPICS.map(s => ({ name: s, value: s })))),

  async execute(interaction){
    try{
      await interaction.deferReply();
      const division = interaction.options.getString('division') || DIVISIONS[0];
      const subtopic = interaction.options.getString('subtopic') || ALLOWED_SUBTOPICS[Math.floor(Math.random()*ALLOWED_SUBTOPICS.length)];
      const question_type = interaction.options.getString('question_type');
      const dl = interaction.options.getString('difficulty');
      const dmap = {'Very Easy (0-19%)':{min:0,max:0.19}, 'Easy (20-39%)':{min:0.2,max:0.39}, 'Medium (40-59%)':{min:0.4,max:0.59}, 'Hard (60-79%)':{min:0.6,max:0.79}, 'Very Hard (80-100%)':{min:0.8,max:1}};
      
      let q;
      let isID = false;
      
      if (question_type === 'id') {
        // Handle ID questions - don't filter by division since ID questions use "B/C"
        const params = prune({ event:EVENT_NAME, difficulty_min: dl?dmap[dl].min:undefined, difficulty_max: dl?dmap[dl].max:undefined, limit:1 });
        try {
          const response = await axios.get(`${PRIMARY_BASE}/api/id-questions`, { params, timeout:15000, headers:AUTH_HEADERS });
          if (!response.data?.success || !response.data.data?.length) {
            await interaction.editReply('No identification questions found for your filters. Try different filters.');
            return;
          }
          q = pickFirst(response.data.data);
          isID = true;
        } catch (error) {
          await interaction.editReply('Failed to fetch ID question. Please try again.');
          return;
        }
      } else {
        // Handle regular questions (MCQ/FRQ)
        const params = prune({ event:EVENT_NAME, division, subtopic, question_type, difficulty_min: dl?dmap[dl].min:undefined, difficulty_max: dl?dmap[dl].max:undefined, limit:1 });
        const listRes = await axios.get(`${PRIMARY_BASE}/api/questions`, { params, timeout:15000, headers:AUTH_HEADERS });
        if(!listRes.data?.success){ await interaction.editReply('API error. Please try again later.'); return; }
        q = pickFirst(listRes.data.data); if(!q){ await interaction.editReply('No questions found matching your criteria. Try different filters.'); return; }
        if(!q.base52 && q.id){ try{ const d=await axios.get(`${PRIMARY_BASE}/api/questions/${q.id}`, {timeout:15000, headers:AUTH_HEADERS}); if(d.data?.success&&d.data.data) q=d.data.data; }catch{} }
      }
      
      if(!q.question){ await interaction.editReply('Question data is incomplete. Please try again.'); return; }

      const embed = buildEmbed(q);
      const files = [];
      if(ALLOW_IMAGES && isID && q.images?.length > 0){
        const imageUrl = q.images[0];
        try {
          const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 10000 });
          const buffer = Buffer.from(imageResponse.data);
          const filename = `image_${Date.now()}.jpg`;
          files.push({ attachment: buffer, name: filename });
          embed.setImage(`attachment://${filename}`);
        } catch {
          embed.setImage(imageUrl);
        }
      }
      
      const sent = await interaction.editReply(files.length? {embeds:[embed], components:[buttonsRow(q.id||interaction.id)], files} : {embeds:[embed], components:[buttonsRow(q.id||interaction.id)]});

      const collector = sent.createMessageComponentCollector({ componentType:ComponentType.Button, time:30*60*1000, filter:i=>i.message.id===sent.id });
      collector.on('collect', async (btn)=>{
        try{
          if(btn.user.id!==interaction.user.id){ await btn.reply({content:'Only the original requester can use these buttons.', ephemeral:true}); return; }
          if(btn.customId===`check_${q.id||interaction.id}`){
            const isMCQ = Array.isArray(q.options)&&q.options.length>0;
            const modalId = `check_modal_${sent.id}`;
            const modal=new ModalBuilder().setCustomId(modalId).setTitle('Check your answer');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('answer_input').setLabel(isMCQ?'Your answer (A, B, C, ...)':'Your answer').setStyle(isMCQ?TextInputStyle.Short:TextInputStyle.Paragraph).setRequired(true).setPlaceholder(isMCQ?'e.g., A':'Type your free-response here')));
            await btn.showModal(modal);
            let sub; try{ sub=await btn.awaitModalSubmit({ time:5*60*1000, filter:i=>i.customId===modalId && i.user.id===interaction.user.id }); }catch{ return; }
            const userAnswer=String(sub.fields.getTextInputValue('answer_input')||'').trim();

            if(isMCQ){
              const opts=q.options||[]; if(!opts.length){ await sub.reply('This question has no options — cannot check as MCQ.'); return; }
              const L=(userAnswer[0]||'').toUpperCase(); const idx=L.charCodeAt(0)-65; if(!(idx>=0&&idx<opts.length)){ await sub.reply(`Invalid choice. Please enter a letter between A and ${letter(opts.length-1)}.`); return; }
              const cIdx=resolveCorrectIndex(q); const correct = idx===cIdx;
              const res=new EmbedBuilder().setColor(correct?COLOR_GREEN:COLOR_RED).setTitle(correct?'✅ Correct!':'❌ Wrong.').addFields(
                {name:'Your answer', value:`**${letter(idx)})** ${opts[idx]}`, inline:true},
                {name:'Correct answer', value:`**${letter(cIdx)})** ${opts[cIdx]}`, inline:true},
              );
              await sub.reply({embeds:[res]});
            } else {
              try{
                const correctAnswers = Array.isArray(q.answers)? q.answers.map(String) : (typeof q.answers==='string'? [q.answers] : []);
                const body = { responses:[{ question:q.question, correctAnswers, studentAnswer:userAnswer }] };
                const g = await axios.post(`${PRIMARY_BASE}/api/gemini/grade-free-responses`, body, {headers:AUTH_HEADERS});
                const grade=g.data?.data?.grades?.[0]; let score=null;
                if(grade && typeof grade.score==='number') score=grade.score; else if(g.data?.data?.scores?.[0]!=null) score=g.data.data.scores[0]; else { await sub.reply('Grading service did not return a result. Please try again shortly.'); return; }
                const isCorrect = Math.round(score*100) > 50;
                const expected = correctAnswers.length? (correctAnswers.join('; ').slice(0,1000)+(correctAnswers.join('; ').length>1000?'…':'')) : '—';
                const res=new EmbedBuilder().setColor(isCorrect?COLOR_GREEN:COLOR_RED).setTitle(isCorrect?'✅ Correct!':'❌ Wrong.').addFields(
                  {name:'Your answer', value:userAnswer.slice(0,1024)||'—', inline:false},
                  {name:'Expected answer', value:expected||'—', inline:false},
                );
                await sub.reply({embeds:[res]});
              }catch(err){
                if(err?.response?.status===429) await sub.reply('The grading service is rate-limited right now. Please try again in a moment.');
                else if(err?.response?.status===401||err?.response?.status===403) await sub.reply('Authentication failed for grading. Check your API key.');
                else if(err?.response?.status) await sub.reply(`Grading failed: HTTP ${err.response.status} - ${err.response.statusText||'Unknown error'}. Please try again shortly.`);
                else await sub.reply(`Grading failed: ${err?.message||'Network or connection error'}. Please try again shortly.`);
              }
            }
          } else if(btn.customId===`explain_${q.id||interaction.id}`){
            await btn.deferReply();
            try{
              const explanation = await getExplanationWithRetry(q, EVENT_NAME, AUTH_HEADERS, COMMAND_NAME);
              const text = explanation || 'No explanation available.';
              const e=new EmbedBuilder().setColor(COLOR_BLUE).setTitle('Explanation');
              if(text.length<=4096){ e.setDescription(text); await btn.editReply({embeds:[e]}); }
              else { e.setDescription('The full explanation is attached as a file below.'); await btn.editReply({embeds:[e], files:[{attachment:Buffer.from(text,'utf-8'), name:'explanation.txt'}]}); }
            }catch(err){
              if(err?.response?.status===429) await btn.editReply('The explanation service is rate-limited right now. Please try again in a moment.');
              else if(err?.response?.status===401||err?.response?.status===403) await btn.editReply('Authentication failed for explanation. Check your API key.');
              else if(err?.response?.status) await btn.editReply(`Could not fetch an explanation: HTTP ${err.response.status} - ${err.response.statusText||'Unknown error'}. Please try again shortly.`);
              else await btn.editReply(`Could not fetch an explanation: ${err?.message||'Network or connection error'}. Please try again shortly.`);
            }
          }
        }catch(e){ try{ if(!btn.replied && !btn.deferred) await btn.reply('Something went wrong handling that action.'); }catch{} }
      });
    }catch(err){
      if(err?.response?.status===429) await interaction.editReply('Rate limit exceeded. Please try again in a few moments.');
      else await interaction.editReply('Command failed. Please try again later.');
    }
  }
};
