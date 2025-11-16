import esbuild from 'esbuild';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const buildModules = async () => {
  const modulesDir = path.join(__dirname, 'src', 'modules');
  const outputDir = path.join(__dirname, 'public', 'dist', 'modules');

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const moduleFiles = fs.readdirSync(modulesDir).filter(file => file.endsWith('.ts'));

  for (const moduleFile of moduleFiles) {
    const inputPath = path.join(modulesDir, moduleFile);
    const outputName = moduleFile.replace('.ts', '.js');
    const outputPath = path.join(outputDir, outputName);

    try {
      await esbuild.build({
        entryPoints: [inputPath],
        bundle: true,
        outfile: outputPath,
        format: 'esm',
        target: 'es2020',
        platform: 'browser',
        minify: true,
        define: {
          'process.env.NODE_ENV': '"production"'
        }
      });
      console.log(`Built module: ${outputName}`);
    } catch (error) {
      console.error(`Error building module ${outputName}:`, error);
    }
  }
};

buildModules().catch(console.error);