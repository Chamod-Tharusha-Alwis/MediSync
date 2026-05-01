const fs = require('fs'); 
const path = require('path'); 

function walk(dir) { 
  let results = []; 
  const list = fs.readdirSync(dir); 
  list.forEach(file => { 
    file = path.resolve(dir, file); 
    const stat = fs.statSync(file); 
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file)); 
    } else { 
      if (file.endsWith('.jsx') || file.endsWith('.js')) results.push(file); 
    } 
  }); 
  return results; 
} 

const files = walk('src'); 
files.forEach(file => { 
  const content = fs.readFileSync(file, 'utf8'); 
  // Replace backslash followed by backtick with just a backtick
  if (content.includes('\\`')) { 
    fs.writeFileSync(file, content.replace(/\\`/g, '`')); 
    console.log('Fixed backticks in ' + file); 
  } 
});
