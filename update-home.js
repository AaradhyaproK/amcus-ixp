const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'pages/Home.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Add import if not exists
if (!content.includes('import HeroSection')) {
  content = content.replace(
    "import { BentoGrid, BentoCard } from '../components/landing/BentoGrid';",
    "import { BentoGrid, BentoCard } from '../components/landing/BentoGrid';\nimport HeroSection from '../components/ui/hero-section';"
  );
}

// Replace in JSX
content = content.replace(/<Navbar \/>/g, '{/* <Navbar /> */}');
content = content.replace(/<NeuralBackground \/>/g, '{/* <NeuralBackground /> */}');
content = content.replace(/<Hero \/>/g, '<HeroSection />');

fs.writeFileSync(filePath, content);
console.log('Home.tsx updated');