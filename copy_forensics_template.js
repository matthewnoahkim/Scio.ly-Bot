const fs = require('fs');
const path = require('path');

// List of commands that need updating
const commandsToUpdate = [
  { file: 'dynamicplanetoceanography.js', event: 'Dynamic Planet - Oceanography' },
  { file: 'diseasedetectives.js', event: 'Disease Detectives' },
  { file: 'circuitlab.js', event: 'Circuit Lab' },
  { file: 'meteorology.js', event: 'Meteorology' },
  { file: 'anatomynervous.js', event: 'Anatomy - Nervous' },
  { file: 'metricmastery.js', event: 'Metric Mastery' },
  { file: 'astronomy.js', event: 'Astronomy' },
  { file: 'anatomysenseorgans.js', event: 'Anatomy - Sense Organs' },
  { file: 'heredity.js', event: 'Heredity' },
  { file: 'entomology.js', event: 'Entomology' },
  { file: 'solarsystem.js', event: 'Solar System' },
  { file: 'potionsandpoisons.js', event: 'Potions and Poisons' },
  { file: 'designergenes.js', event: 'Designer Genes' },
  { file: 'chemistrylab.js', event: 'Chemistry Lab' },
  { file: 'rocksandminerals.js', event: 'Rocks and Minerals' },
  { file: 'waterqualityfreshwater.js', event: 'Water Quality - Freshwater' }
];

console.log('🚀 Starting to update all commands to use the modern button system...\n');

// Read the working forensics command as template
const forensicsPath = path.join(__dirname, 'commands', 'utility', 'forensics.js');
const forensicsTemplate = fs.readFileSync(forensicsPath, 'utf8');

commandsToUpdate.forEach((command, index) => {
  console.log(`[${index + 1}/${commandsToUpdate.length}] Updating ${command.file}...`);
  
  const filePath = path.join(__dirname, 'commands', 'utility', command.file);
  
  // Read the current command file
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Extract the command name from filename
  const commandName = command.file.replace('.js', '');
  
  // Create the new content by adapting the forensics template
  let newContent = forensicsTemplate
    .replace(/forensics/g, commandName)
    .replace(/Forensics/g, command.event)
    .replace(/\[forensics\]/g, `[${commandName}]`)
    .replace(/event: 'Forensics'/g, `event: '${command.event}'`)
    .replace(/event: "Forensics"/g, `event: "${command.event}"`);
  
  // Write the updated file
  fs.writeFileSync(filePath, newContent);
  console.log(`✅ Updated ${command.file}`);
});

console.log('\n🎉 All commands have been updated to use the modern button system!');
console.log('\n📋 Next steps:');
console.log('1. Run: node deploy-commands.js');
console.log('2. Restart your bot: node index.js');
console.log('3. Test the commands - they should now have buttons instead of /check messages!'); 