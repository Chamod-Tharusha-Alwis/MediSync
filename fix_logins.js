const fs = require('fs');

const files = [
  'c:\\Users\\chamo\\OneDrive\\Desktop\\Final project\\medisync\\client\\src\\pages\\hospital\\Login.jsx',
  'c:\\Users\\chamo\\OneDrive\\Desktop\\Final project\\medisync\\client\\src\\pages\\patient\\Login.jsx',
  'c:\\Users\\chamo\\OneDrive\\Desktop\\Final project\\medisync\\client\\src\\pages\\pharmacy\\Login.jsx'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(
    "import LoginShell from '../../components/common/LoginShell';",
    "import LoginShell from '../../components/common/LoginShell';\nimport GlassInput from '../../components/common/GlassInput';\nimport GlassButton from '../../components/common/GlassButton';"
  );
  fs.writeFileSync(file, content);
  console.log(`Updated ${file}`);
});
