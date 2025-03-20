export class TextRank {
    private similarityMatrix: number[][];
    private sentences: string[];

    constructor() {
        this.similarityMatrix = [];
        this.sentences = [];
    }

    private cosineSimilarity(sent1: string, sent2: string): number {
        const words1 = sent1.toLowerCase().split(' ');
        const words2 = sent2.toLowerCase().split(' ');
        const wordSet = new Set([...words1, ...words2]);
        
        const vector1 = Array.from(wordSet).map(word => words1.filter(w => w === word).length);
        const vector2 = Array.from(wordSet).map(word => words2.filter(w => w === word).length);
        
        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;
        
        for (let i = 0; i < vector1.length; i++) {
            dotProduct += vector1[i] * vector2[i];
            norm1 += vector1[i] * vector1[i];
            norm2 += vector2[i] * vector2[i];
        }
        
        return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2)) || 0;
    }

    private buildSimilarityMatrix(): void {
        const n = this.sentences.length;
        this.similarityMatrix = Array(n).fill().map(() => Array(n).fill(0));
        
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                if (i !== j) {
                    this.similarityMatrix[i][j] = this.cosineSimilarity(
                        this.sentences[i],
                        this.sentences[j]
                    );
                }
            }
        }
    }

    private rankSentences(damping: number = 0.85, iterations: number = 30): number[] {
        const n = this.sentences.length;
        let scores = Array(n).fill(1/n);
        
        for (let iter = 0; iter < iterations; iter++) {
            const newScores = Array(n).fill(0);
            
            for (let i = 0; i < n; i++) {
                let sum = 0;
                for (let j = 0; j < n; j++) {
                    if (i !== j) {
                        let denominator = this.similarityMatrix[j].reduce((a, b, idx) => 
                            idx !== j ? a + b : a, 0);
                        sum += (this.similarityMatrix[j][i] * scores[j]) / (denominator || 1);
                    }
                }
                newScores[i] = (1 - damping) + damping * sum;
            }
            scores = newScores;
        }
        
        return scores;
    }

    public summarize(text: string, numSentences: number = 3): string {
        this.sentences = text
            .replace(/([.!?])\s+/g, "$1|")
            .split("|")
            .filter(s => s.trim().length > 0);
        
        if (this.sentences.length <= numSentences) {
            return text;
        }

        this.buildSimilarityMatrix();
        const scores = this.rankSentences();
        
        const rankedIndices = scores
            .map((score, idx) => ({score, idx}))
            .sort((a, b) => b.score - a.score)
            .slice(0, numSentences)
            .sort((a, b) => a.idx - b.idx)
            .map(item => item.idx);
        
        return rankedIndices.map(idx => this.sentences[idx]).join(' ');
    }
}
