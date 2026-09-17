npm create vite@latest . -- --template react-ts -y
npm install lucide-react motion express @google/genai dotenv
mkdir -p data src/components
cat << 'JSON' > data/consensus_history.json
{"history":[],"totalQueries":0,"lastUpdated":"2026-09-17T03:30:00Z"}
JSON
git add -A
git commit -m "feat: setup Malaz consensus engine codebase"
git push origin main
