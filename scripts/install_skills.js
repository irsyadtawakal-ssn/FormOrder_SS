const fs = require('fs');
const path = require('path');

const pluginsDir = path.join(__dirname, '../antigravity-awesome-skills/plugins');
const agentsDir = path.join(__dirname, '../.agents');

if (!fs.existsSync(agentsDir)) {
  fs.mkdirSync(agentsDir);
}

const entries = [];
const plugins = fs.readdirSync(pluginsDir);

plugins.forEach(plugin => {
  const skillsPath = path.join(pluginsDir, plugin, 'skills');
  if (fs.existsSync(skillsPath)) {
    entries.push({ path: path.relative(agentsDir, skillsPath).replace(/\\/g, '/') });
  }
});

const skillsJson = {
  entries: entries
};

fs.writeFileSync(path.join(agentsDir, 'skills.json'), JSON.stringify(skillsJson, null, 2));
console.log('Created .agents/skills.json');
