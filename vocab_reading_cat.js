/**
 * JACET Vocabulary Size CAT + Reading Comprehension Test
 */

// Simple CSV parser function
function parseCSV(text) {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/\r$/, ''));
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        if (values.length === headers.length) {
            const row = {};
            headers.forEach((header, index) => {
                let value = values[index].trim().replace(/\r$/, '');
                
                // Convert numeric fields for vocabulary items
                if (header === 'Level') {
                    row[header] = parseInt(value);
                } else if (header === 'Dscrimination' || header === 'Difficulty' || header === 'Guessing') {
                    row[header] = parseFloat(value);
                } else {
                    row[header] = value;
                }
            });
            data.push(row);
        }
    }
    return data;
}

// Enhanced CSV parser for reading texts (handles quoted text with commas)
function parseReadingCSV(text) {
    // Use Papa Parse for more robust CSV parsing
    return text; // Will be parsed with Papa.parse in loadData
}

// Data Collection and Analysis Class
class DataCollector {
    constructor() {
        this.sessions = [];
        this.currentSession = {
            sessionId: this.generateSessionId(),
            startTime: new Date(),
            browserInfo: this.getBrowserInfo(),
            screenInfo: this.getScreenInfo(),
            interactions: [],
            detailedResponses: [],
            mouseMovements: [],
            focusEvents: [],
            checkpoints: [] // NEW: For partial save points
        };
        this.initializeEventListeners();
    }

    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    getBrowserInfo() {
        return {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            cookieEnabled: navigator.cookieEnabled,
            onlineStatus: navigator.onLine,
            timestamp: new Date().toISOString()
        };
    }

    getScreenInfo() {
        return {
            width: window.screen.width,
            height: window.screen.height,
            availWidth: window.screen.availWidth,
            availHeight: window.screen.availHeight,
            colorDepth: window.screen.colorDepth,
            pixelRatio: window.devicePixelRatio || 1
        };
    }

    initializeEventListeners() {
        // Mouse movement tracking (sampled)
        let lastMouseLog = 0;
        document.addEventListener('mousemove', (e) => {
            const now = Date.now();
            if (now - lastMouseLog > 100) { // Sample every 100ms
                this.currentSession.mouseMovements.push({
                    x: e.clientX,
                    y: e.clientY,
                    timestamp: now
                });
                lastMouseLog = now;
            }
        });

        // Focus/Blur events
        window.addEventListener('blur', () => {
            this.currentSession.focusEvents.push({
                type: 'blur',
                timestamp: Date.now()
            });
        });

        window.addEventListener('focus', () => {
            this.currentSession.focusEvents.push({
                type: 'focus',
                timestamp: Date.now()
            });
        });

        // Page unload warning
        window.addEventListener('beforeunload', (e) => {
            if (this.currentSession.interactions.length > 0) {
                e.preventDefault();
                e.returnValue = 'テストが進行中です。このページを離れると、データが失われる可能性があります。';
            }
        });
    }

    logInteraction(action, data) {
        this.currentSession.interactions.push({
            action: action,
            data: data,
            timestamp: Date.now(),
            relativeTime: Date.now() - this.currentSession.startTime.getTime()
        });
    }

    logDetailedResponse(responseData) {
        this.currentSession.detailedResponses.push({
            ...responseData,
            timestamp: Date.now(),
            relativeTime: Date.now() - this.currentSession.startTime.getTime()
        });
    }

    // NEW: Save checkpoint for partial data
    saveCheckpoint(checkpointName, testData) {
        const checkpoint = {
            name: checkpointName,
            timestamp: new Date().toISOString(),
            sessionData: this.getSessionSummary(),
            testData: testData
        };
        this.currentSession.checkpoints.push(checkpoint);
        
        // Optionally export checkpoint data
        if (checkpointName === 'vocabulary_completed' || 
            checkpointName === 'narrative_completed' || 
            checkpointName === 'expository_completed') {
            this.exportCheckpointData(checkpoint);
        }
    }

    exportCheckpointData(checkpoint) {
        const blob = new Blob([JSON.stringify(checkpoint, null, 2)], 
            { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `checkpoint_${checkpoint.name}_${this.currentSession.sessionId}.json`;
        // Silent save - don't click automatically, just prepare the link
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }

    getSessionSummary() {
        return {
            ...this.currentSession,
            endTime: new Date(),
            totalDuration: Date.now() - this.currentSession.startTime.getTime(),
            interactionCount: this.currentSession.interactions.length,
            responseCount: this.currentSession.detailedResponses.length
        };
    }
}

// Enhanced Main Test Class
class VocabReadingCATTest {
    constructor() {
        this.vocabularyItems = [];
        this.readingTexts = [];
        this.dataCollector = new DataCollector();
        this.loadData();
    }

    async loadDataWithRetry(url, maxRetries = 3) {
        let lastError;
        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Failed to load data: ${response.status}`);
                }
                return await response.text();
            } catch (error) {
                lastError = error;
                console.warn(`Attempt ${i + 1} failed for ${url}:`, error);
                if (i < maxRetries - 1) {
                    // Wait before retry (exponential backoff)
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
                }
            }
        }
        throw lastError;
    }

    async loadData() {
        try {
            // Load vocabulary data with retry
            const vocabText = await this.loadDataWithRetry('./jacet_parameters.csv');
            this.vocabularyItems = parseCSV(vocabText);

            // Load reading texts data with retry
            const readingText = await this.loadDataWithRetry('./reading_texts.csv');
            
            // Use Papa Parse for robust parsing of reading texts
            if (typeof Papa !== 'undefined') {
                const parsed = Papa.parse(readingText, {
                    header: true,
                    skipEmptyLines: true,
                    dynamicTyping: true,
                    quoteChar: '"',
                    escapeChar: '"'
                });
                this.readingTexts = parsed.data.map(row => ({
                    ...row,
                    // More aggressive quote cleaning
                    text: row.text ? this.cleanText(row.text) : '',
                    question1: row.question1 ? this.cleanText(row.question1) : '',
                    question2: row.question2 ? this.cleanText(row.question2) : ''
                }));
            } else {
                // Fallback if Papa Parse not available
                this.readingTexts = parseCSV(readingText);
            }
            
            console.log(`Loaded ${this.vocabularyItems.length} vocabulary items`);
            console.log(`Loaded ${this.readingTexts.length} reading texts`);
            
            this.dataCollector.logInteraction('data_loaded', {
                vocabCount: this.vocabularyItems.length,
                readingCount: this.readingTexts.length
            });
            
            this.reset();
            this.render();
        } catch (error) {
            console.error('Failed to load data:', error);
            this.dataCollector.logInteraction('data_load_error', {
                error: error.message
            });
            this.showError(error);
        }
    }

    showError(error = null) {
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="error fade-in">
                <h3>データの読み込みに失敗しました</h3>
                ${error ? `<p class="text-danger">エラー: ${error.message}</p>` : ''}
                <p>以下の点を確認してください：</p>
                <ul class="text-start" style="max-width: 600px; margin: 0 auto;">
                    <li>jacet_parameters.csv と reading_texts.csv ファイルが同じディレクトリにあること</li>
                    <li>ローカルサーバーを使用していること（file:// プロトコルでは動作しません）</li>
                    <li>サーバー例: <code>python -m http.server 8000</code> または <code>npx serve .</code></li>
                    <li>ネットワーク接続が安定していること</li>
                </ul>
                <button id="retryBtn" class="btn btn-primary mt-3">再試行</button>
            </div>
        `;
        
        document.getElementById('retryBtn').addEventListener('click', () => {
            location.reload();
        });
    }

    reset() {
        // CAT Phase variables
        this.started = false;
        this.catDone = false;
        this.administeredItems = [];
        this.responses = [];
        this.responseDetails = []; // Detailed response tracking
        this.theta = 0;
        this.se = Infinity;
        this.nextItem = this.selectInitialItem();
        
        // Reading Phase variables
        this.phase = 'cat'; // 'cat', 'reading_narrative', 'reading_expository', 'final'
        this.readingLevel = 2;
        this.readingStep = 'text'; // 'text', 'question1', 'question2'
        this.currentReadingText = null;
        this.readingAnswers = {
            narrative: { question1: '', question2: '' },
            expository: { question1: '', question2: '' }
        };
        this.readingTimes = {
            narrative: { 
                textStart: null, 
                question1Start: null, 
                question1End: null,
                question2Start: null, 
                question2End: null 
            },
            expository: { 
                textStart: null, 
                question1Start: null, 
                question1End: null,
                question2Start: null, 
                question2End: null 
            }
        };
        
        // Enhanced tracking
        this.detailedReadingData = {
            narrative: { textInteractions: [], questionInteractions: [] },
            expository: { textInteractions: [], questionInteractions: [] }
        };
        
        this.allCompleted = false;
    }

    // Clean text from CSV artifacts
    cleanText(text) {
        return text
            .replace(/\\n/g, '\n')           // Convert \n to actual line breaks
            .replace(/""/g, '"')             // Convert escaped quotes
            .replace(/^"/, '')               // Remove leading quote
            .replace(/"$/, '')               // Remove trailing quote
            .replace(/^"\n/, '\n')           // Remove quote at start of line
            .replace(/\n"$/m, '\n')          // Remove quote at end of line
            .replace(/\n"\n/g, '\n\n')       // Remove quotes between paragraphs
            .replace(/\n"/g, '\n')           // Remove quotes at line start
            .trim();
    }

    // HTML escape function
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Determine reading level from vocabulary size
    getReadingLevel(vocabSize) {
        if (vocabSize < 2000) return 2;
        if (vocabSize < 3000) return 2;
        if (vocabSize < 4000) return 3;
        if (vocabSize < 5000) return 4;
        if (vocabSize < 6000) return 5;
        if (vocabSize < 7000) return 6;
        return 7;
    }

    // Get reading text by level and type
    getReadingText(level, type) {
        return this.readingTexts.find(text => 
            text.level === level && text.type === type
        );
    }

    selectInitialItem() {
        const level3to5Indices = [];
        for (let i = 0; i < this.vocabularyItems.length; i++) {
            if (this.vocabularyItems[i].Level >= 3 && this.vocabularyItems[i].Level <= 5) {
                level3to5Indices.push(i);
            }
        }
        return level3to5Indices[Math.floor(Math.random() * level3to5Indices.length)];
    }

    // 3PL probability function
    prob3PL(theta, a, b, c) {
        return c + (1 - c) / (1 + Math.exp(-a * (theta - b)));
    }

    // Item information function
    itemInfo3PL(theta, a, b, c) {
        const p = this.prob3PL(theta, a, b, c);
        const q = 1 - p;
        if (p <= c || p >= 1) return 0;
        return (a * a * q * Math.pow(p - c, 2)) / (p * Math.pow(1 - c, 2));
    }

    // EAP estimation
    estimateAbilityEAP(items, responses) {
        if (!items.length) return {theta: 0, se: Infinity};

        const grid = [];
        for (let i = -4; i <= 4; i += 0.01) {
            grid.push(i);
        }

        const prior = grid.map(x => this.normalDensity(x, 0, 1));
        let likelihood = new Array(grid.length).fill(1);

        for (let i = 0; i < items.length; i++) {
            const item = this.vocabularyItems[items[i]];
            for (let j = 0; j < grid.length; j++) {
                const p = this.prob3PL(grid[j], item.Dscrimination, item.Difficulty, item.Guessing);
                likelihood[j] *= responses[i] ? p : (1 - p);
            }
        }

        let posterior = [];
        let sum = 0;
        for (let i = 0; i < grid.length; i++) {
            posterior[i] = likelihood[i] * prior[i];
            sum += posterior[i];
        }

        // Normalize
        if (sum > 0) {
            posterior = posterior.map(p => p / sum);
        } else {
            // Fallback if likelihood becomes 0
            posterior = prior.map(p => p / prior.reduce((a, b) => a + b, 0));
        }

        // Calculate mean and variance
        let theta = 0;
        let variance = 0;
        for (let i = 0; i < grid.length; i++) {
            theta += grid[i] * posterior[i];
        }
        for (let i = 0; i < grid.length; i++) {
            variance += Math.pow(grid[i] - theta, 2) * posterior[i];
        }

        return {theta: theta, se: Math.sqrt(variance)};
    }

    normalDensity(x, mean = 0, sd = 1) {
        return (1 / (sd * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - mean) / sd, 2));
    }

    // Select next item
    selectNext(theta, administered, needHigh) {
        let pool = [];
        for (let i = 0; i < this.vocabularyItems.length; i++) {
            if (!administered.includes(i)) {
                pool.push(i);
            }
        }

        if (needHigh) {
            const highLevel = pool.filter(i => this.vocabularyItems[i].Level >= 7);
            if (highLevel.length > 0) {
                pool = highLevel;
            }
        }

        if (pool.length === 0) return -1;

        let maxInfo = -1;
        let bestItem = -1;

        for (const itemIdx of pool) {
            const item = this.vocabularyItems[itemIdx];
            const info = this.itemInfo3PL(theta, item.Dscrimination, item.Difficulty, item.Guessing);
            if (info > maxInfo) {
                maxInfo = info;
                bestItem = itemIdx;
            }
        }

        return bestItem;
    }

    // Convert theta to vocabulary size
    vocabFromTheta(theta) {
        const difficulties = [-2.206, -1.512, -0.701, -0.075, 0.748, 1.152, 1.504, 2.089];
        return difficulties.reduce((sum, diff) => {
            return sum + 1000 / (1 + Math.exp(-(theta - diff)));
        }, 0);
    }

    handleVocabResponse(selectedOption) {
        const startTime = this.lastQuestionStartTime || Date.now();
        const responseTime = Date.now() - startTime;
        const item = this.vocabularyItems[this.nextItem];
        const correct = selectedOption === item.CorrectAnswer ? 1 : 0;

        // Store detailed response data
        this.responseDetails.push({
            itemIndex: this.nextItem,
            item: item.Item,
            level: item.Level,
            partOfSpeech: item.PartOfSpeech,
            correctAnswer: item.CorrectAnswer,
            selectedAnswer: selectedOption,
            correct: correct,
            responseTime: responseTime,
            itemParameters: {
                discrimination: item.Dscrimination,
                difficulty: item.Difficulty,
                guessing: item.Guessing
            },
            abilityBeforeResponse: this.theta,
            seBeforeResponse: this.se,
            timestamp: Date.now()
        });

        this.administeredItems.push(this.nextItem);
        this.responses.push(correct);

        // Update ability estimate
        const estimate = this.estimateAbilityEAP(this.administeredItems, this.responses);
        this.theta = estimate.theta;
        this.se = estimate.se;

        // Log interaction
        this.dataCollector.logInteraction('vocab_response', {
            item: item.Item,
            correct: correct,
            responseTime: responseTime,
            newTheta: this.theta,
            newSE: this.se
        });

        // Check termination conditions
        const needHigh = this.administeredItems.filter(i => this.vocabularyItems[i].Level >= 7).length < 2;
        
        if ((this.se > 0.4 || this.administeredItems.length < 20 || needHigh) && this.administeredItems.length < 30) {
            this.nextItem = this.selectNext(this.theta, this.administeredItems, needHigh);
            if (this.nextItem === -1) {
                this.finishCAT();
            }
        } else {
            this.finishCAT();
        }

        this.render();
    }

    finishCAT() {
        this.catDone = true;
        const vocabSize = this.vocabFromTheta(this.theta);
        this.readingLevel = this.getReadingLevel(vocabSize);
        this.phase = 'reading_narrative';
        this.readingStep = 'text';
        this.currentReadingText = this.getReadingText(this.readingLevel, 'narrative');
        // Record reading start time
        this.readingTimes.narrative.textStart = new Date();
        
        // Log CAT completion
        this.dataCollector.logInteraction('cat_completed', {
            finalTheta: this.theta,
            finalSE: this.se,
            vocabSize: vocabSize,
            readingLevel: this.readingLevel,
            totalItems: this.administeredItems.length,
            correctItems: this.responses.filter(r => r === 1).length
        });

        // Save checkpoint for vocabulary completion
        this.dataCollector.saveCheckpoint('vocabulary_completed', {
            theta: this.theta,
            se: this.se,
            vocabSize: vocabSize,
            responses: this.responseDetails,
            administeredItems: this.administeredItems
        });
    }

    handleReadingAnswer(answer) {
        const currentType = this.phase.replace('reading_', '');
        const currentTime = new Date();
        
        // Detailed response logging
        const responseData = {
            phase: this.phase,
            type: currentType,
            level: this.readingLevel,
            step: this.readingStep,
            question: this.readingStep === 'question1' ? 
                this.currentReadingText.question1 : 
                this.currentReadingText.question2,
            answer: answer,
            answerLength: answer.split(' ').length,
            answerSentences: answer.split(/[.!?]+/).filter(s => s.trim()).length,
            timeToAnswer: currentTime - (this.readingStep === 'question1' ? 
                this.readingTimes[currentType].question1Start : 
                this.readingTimes[currentType].question2Start),
            textContent: this.currentReadingText.text,
            timestamp: currentTime.toISOString()
        };
        
        this.dataCollector.logDetailedResponse(responseData);
        
        if (this.readingStep === 'question1') {
            this.readingAnswers[currentType].question1 = answer;
            this.readingTimes[currentType].question1End = currentTime;
            this.readingStep = 'question2';
            this.readingTimes[currentType].question2Start = currentTime;
        } else if (this.readingStep === 'question2') {
            this.readingAnswers[currentType].question2 = answer;
            this.readingTimes[currentType].question2End = currentTime;
            
            if (this.phase === 'reading_narrative') {
                // Save checkpoint for narrative completion
                this.dataCollector.saveCheckpoint('narrative_completed', {
                    readingLevel: this.readingLevel,
                    narrativeAnswers: this.readingAnswers.narrative,
                    narrativeTimes: this.readingTimes.narrative
                });
                
                // Move to expository
                this.phase = 'reading_expository';
                this.readingStep = 'text';
                this.currentReadingText = this.getReadingText(this.readingLevel, 'expository');
                this.readingTimes.expository.textStart = currentTime;
            } else {
                // Save checkpoint for expository completion
                this.dataCollector.saveCheckpoint('expository_completed', {
                    readingLevel: this.readingLevel,
                    allAnswers: this.readingAnswers,
                    allTimes: this.readingTimes
                });
                
                // All completed
                this.phase = 'final';
                this.allCompleted = true;
            }
        }
        
        this.render();
    }

    // Enhanced export functions
    exportToExcel() {
        try {
            // Check if XLSX library is loaded
            if (typeof XLSX === 'undefined') {
                alert('Excelライブラリが読み込まれていません。ページを再読み込みしてください。');
                console.error('XLSX library not loaded');
                return;
            }

            // Vocabulary responses with enhanced data
            const vocabResponses = this.responseDetails.map((detail, i) => ({
                item_id: detail.itemIndex,
                word: detail.item,
                level: detail.level,
                part_of_speech: detail.partOfSpeech,
                correct_answer: detail.correctAnswer,
                selected_answer: detail.selectedAnswer,
                response: detail.correct,
                correct: detail.correct === 1 ? "正解" : "不正解",
                response_time_ms: detail.responseTime,
                discrimination: detail.itemParameters.discrimination,
                difficulty: detail.itemParameters.difficulty,
                guessing: detail.itemParameters.guessing,
                ability_before: detail.abilityBeforeResponse,
                se_before: detail.seBeforeResponse,
                item_order: i + 1
            }));

            // Reading responses with timing data (in milliseconds)
            const readingResponses = [
                {
                    type: 'narrative',
                    level: this.readingLevel,
                    question1: this.readingAnswers.narrative.question1,
                    question1_length: this.readingAnswers.narrative.question1.split(' ').length,
                    question2: this.readingAnswers.narrative.question2,
                    question2_length: this.readingAnswers.narrative.question2.split(' ').length,
                    text_read_time_ms: this.readingTimes.narrative.question1Start && this.readingTimes.narrative.textStart ? 
                        (this.readingTimes.narrative.question1Start - this.readingTimes.narrative.textStart) : 0,
                    question1_time_ms: this.readingTimes.narrative.question1End && this.readingTimes.narrative.question1Start ?
                        (this.readingTimes.narrative.question1End - this.readingTimes.narrative.question1Start) : 0,
                    question2_time_ms: this.readingTimes.narrative.question2End && this.readingTimes.narrative.question2Start ?
                        (this.readingTimes.narrative.question2End - this.readingTimes.narrative.question2Start) : 0,
                    total_time_ms: this.readingTimes.narrative.question2End && this.readingTimes.narrative.textStart ?
                        (this.readingTimes.narrative.question2End - this.readingTimes.narrative.textStart) : 0
                },
                {
                    type: 'expository', 
                    level: this.readingLevel,
                    question1: this.readingAnswers.expository.question1,
                    question1_length: this.readingAnswers.expository.question1.split(' ').length,
                    question2: this.readingAnswers.expository.question2,
                    question2_length: this.readingAnswers.expository.question2.split(' ').length,
                    text_read_time_ms: this.readingTimes.expository.question1Start && this.readingTimes.expository.textStart ? 
                        (this.readingTimes.expository.question1Start - this.readingTimes.expository.textStart) : 0,
                    question1_time_ms: this.readingTimes.expository.question1End && this.readingTimes.expository.question1Start ?
                        (this.readingTimes.expository.question1End - this.readingTimes.expository.question1Start) : 0,
                    question2_time_ms: this.readingTimes.expository.question2End && this.readingTimes.expository.question2Start ?
                        (this.readingTimes.expository.question2End - this.readingTimes.expository.question2Start) : 0,
                    total_time_ms: this.readingTimes.expository.question2End && this.readingTimes.expository.textStart ?
                        (this.readingTimes.expository.question2End - this.readingTimes.expository.textStart) : 0
                }
            ];

            // Summary with enhanced metrics
            const totalReadingTime = 
                (this.readingTimes.narrative.question2End && this.readingTimes.narrative.textStart ? 
                    (this.readingTimes.narrative.question2End - this.readingTimes.narrative.textStart) : 0) +
                (this.readingTimes.expository.question2End && this.readingTimes.expository.textStart ? 
                    (this.readingTimes.expository.question2End - this.readingTimes.expository.textStart) : 0);

            const summary = [{
                test_date: new Date().toLocaleString('ja-JP'),
                session_id: this.dataCollector.currentSession.sessionId,
                theta: Math.round(this.theta * 100) / 100,
                standard_error: Math.round(this.se * 100) / 100,
                vocabulary_size: Math.round(this.vocabFromTheta(this.theta)),
                reading_level: this.readingLevel,
                total_vocab_items: this.administeredItems.length,
                correct_vocab_answers: this.responses.filter(r => r === 1).length,
                vocab_accuracy_percent: Math.round((this.responses.filter(r => r === 1).length / this.responses.length) * 100 * 10) / 10,
                avg_vocab_response_time_ms: Math.round(vocabResponses.reduce((sum, r) => sum + r.response_time_ms, 0) / vocabResponses.length),
                total_reading_time_ms: totalReadingTime,
                total_test_duration_ms: Date.now() - this.dataCollector.currentSession.startTime.getTime()
            }];

            const wb = XLSX.utils.book_new();
            const wsSummary = XLSX.utils.json_to_sheet(summary);
            const wsVocab = XLSX.utils.json_to_sheet(vocabResponses);
            const wsReading = XLSX.utils.json_to_sheet(readingResponses);

            XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");
            XLSX.utils.book_append_sheet(wb, wsVocab, "Vocabulary_Responses");
            XLSX.utils.book_append_sheet(wb, wsReading, "Reading_Responses");

            const date = new Date().toISOString().split('T')[0];
            XLSX.writeFile(wb, `vocab_reading_cat_result_${date}.xlsx`);
            
            console.log('Excel file exported successfully');
            
        } catch (error) {
            console.error('Error exporting Excel:', error);
            alert('Excelファイルの作成中にエラーが発生しました。コンソールを確認してください。');
        }
    }

    // Export detailed JSON for analysis
    exportDetailedJSON() {
        const detailedData = {
            sessionInfo: this.dataCollector.getSessionSummary(),
            testResults: {
                vocabulary: {
                    theta: this.theta,
                    se: this.se,
                    vocabSize: this.vocabFromTheta(this.theta),
                    responses: this.responseDetails,
                    itemOrder: this.administeredItems
                },
                reading: {
                    level: this.readingLevel,
                    answers: this.readingAnswers,
                    timings: this.readingTimes,
                    texts: {
                        narrative: this.getReadingText(this.readingLevel, 'narrative'),
                        expository: this.getReadingText(this.readingLevel, 'expository')
                    }
                }
            },
            analysisMetadata: {
                testVersion: '2.0-enhanced',
                exportTime: new Date().toISOString(),
                completionStatus: this.allCompleted ? 'completed' : 'incomplete',
                checkpoints: this.dataCollector.currentSession.checkpoints
            }
        };

        const blob = new Blob([JSON.stringify(detailedData, null, 2)], 
            { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cat_detailed_data_${this.dataCollector.currentSession.sessionId}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    render() {
        const app = document.getElementById('app');

        if (this.phase === 'cat' && !this.started) {
            // Enhanced landing page with detailed test overview
            app.innerHTML = `
                <div class="row pt-4 fade-in">
                    <div class="col-10 offset-1">
                        <div class="text-center mb-5">
                            <h1 class="display-4 mb-3">語彙・読解力測定システム</h1>
                            <p class="lead text-muted">個人最適化による英語力測定</p>
                        </div>

                        <!-- Test Overview -->
                        <div class="card mb-4 shadow-sm">
                            <div class="card-header bg-primary text-white">
                                <h4 class="mb-0"><i class="fas fa-info-circle me-2"></i>テスト概要</h4>
                            </div>
                            <div class="card-body">
                                <div class="row">
                                    <div class="col-md-6">
                                        <h5 class="text-primary"><i class="fas fa-brain me-2"></i>測定内容</h5>
                                        <ul class="list-unstyled">
                                            <li><strong>語彙力:</strong> 推定語彙サイズ（0-8000語）</li>
                                            <li><strong>読解力:</strong> レベル別理解度測定</li>
                                            <li><strong class="text-info">NEW:</strong> 回答パターン分析</li>
                                        </ul>
                                    </div>
                                    <div class="col-md-6">
                                        <h5 class="text-success"><i class="fas fa-clock me-2"></i>所要時間</h5>
                                        <ul class="list-unstyled">
                                            <li><strong>語彙テスト:</strong> 約5-8分</li>
                                            <li><strong>読解テスト:</strong> 約7-10分</li>
                                            <li><strong>合計:</strong> 約12-18分</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Data Collection Notice -->
                        <div class="card mb-4 shadow-sm border-info">
                            <div class="card-header bg-info text-white">
                                <h4 class="mb-0"><i class="fas fa-database me-2"></i>データ収集について</h4>
                            </div>
                            <div class="card-body">
                                <p>このバージョンでは、テストの改善のため以下のデータを収集します：</p>
                                <ul>
                                    <li>回答内容と回答時間</li>
                                    <li>問題ごとの正答率</li>
                                    <li>読解回答の詳細分析用データ</li>
                                    <li>操作ログ（匿名化済み）</li>
                                </ul>
                                <p class="text-muted mb-0"><small>収集データは研究目的にのみ使用され、個人情報は含まれません。</small></p>
                            </div>
                        </div>

                        <!-- Test Flow -->
                        <div class="card mb-4 shadow-sm">
                            <div class="card-header bg-info text-white">
                                <h4 class="mb-0"><i class="fas fa-route me-2"></i>テストの流れ</h4>
                            </div>
                            <div class="card-body">
                                <div class="row">
                                    <div class="col-lg-4 mb-3">
                                        <div class="text-center p-3 border rounded bg-light">
                                            <div class="display-6 text-primary mb-2">1</div>
                                            <h5>語彙力測定</h5>
                                            <p class="mb-0">CAT方式による<br>効率的な語彙テスト<br><small class="text-muted">(20-30問)</small></p>
                                        </div>
                                    </div>
                                    <div class="col-lg-4 mb-3">
                                        <div class="text-center p-3 border rounded bg-light">
                                            <div class="display-6 text-success mb-2">2</div>
                                            <h5>読解力測定</h5>
                                            <p class="mb-0">レベル別テキスト<br>2種類の読解問題<br><small class="text-muted">(物語文・説明文)</small></p>
                                        </div>
                                    </div>
                                    <div class="col-lg-4 mb-3">
                                        <div class="text-center p-3 border rounded bg-light">
                                            <div class="display-6 text-warning mb-2">3</div>
                                            <h5>結果分析</h5>
                                            <p class="mb-0">詳細な能力分析<br>Excel + JSON出力<br><small class="text-muted">(分析用データ含む)</small></p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Technical Features -->
                        <div class="row mb-4">
                            <div class="col-md-6">
                                <div class="card h-100 shadow-sm">
                                    <div class="card-header bg-success text-white">
                                        <h5 class="mb-0"><i class="fas fa-cogs me-2"></i>技術的特徴</h5>
                                    </div>
                                    <div class="card-body">
                                        <ul class="list-unstyled">
                                            <li><i class="fas fa-check text-success me-2"></i>3PL-IRT理論に基づく測定</li>
                                            <li><i class="fas fa-check text-success me-2"></i>個人最適化された問題選択</li>
                                            <li><i class="fas fa-check text-success me-2"></i>リアルタイム能力値推定</li>
                                            <li><i class="fas fa-check text-success me-2"></i>詳細な時間分析（ミリ秒単位）</li>
                                            <li><i class="fas fa-check text-success me-2"></i>レベル別自動振り分け</li>
                                            <li><i class="fas fa-check text-success me-2"></i><strong class="text-info">詳細データ収集機能</strong></li>
                                            <li><i class="fas fa-check text-success me-2"></i><strong class="text-info">中断時の自動チェックポイント保存</strong></li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="card h-100 shadow-sm">
                                    <div class="card-header bg-warning text-dark">
                                        <h5 class="mb-0"><i class="fas fa-exclamation-triangle me-2"></i>重要な注意事項</h5>
                                    </div>
                                    <div class="card-body">
                                        <ul class="list-unstyled">
                                            <li><i class="fas fa-info-circle text-info me-2"></i>語彙問題は4択選択式</li>
                                            <li><i class="fas fa-info-circle text-info me-2"></i>読解問題は自由記述式</li>
                                            <li><i class="fas fa-info-circle text-info me-2"></i>わからない問題も必ず回答</li>
                                            <li><i class="fas fa-info-circle text-warning me-2"></i><strong>回答後の修正・戻る機能はありません</strong></li>
                                            <li><i class="fas fa-info-circle text-danger me-2"></i><strong>ブラウザの戻るボタンは使用禁止</strong></li>
                                            <li><i class="fas fa-info-circle text-info me-2"></i>集中して最後まで取り組んでください</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Start Button -->
                        <div class="text-center">
                            <div class="card shadow-lg border-primary">
                                <div class="card-body p-4">
                                    <h4 class="mb-3">測定開始の準備はよろしいですか？</h4>
                                    <p class="text-muted mb-4">データ読み込み完了: 語彙項目 ${this.vocabularyItems.length}問 | 読解テキスト ${this.readingTexts.length}種類</p>
                                    <p class="text-danger mb-4"><strong>注意: 一度回答した問題には戻れません</strong></p>
                                    <button id="startBtn" class="btn btn-primary btn-lg px-5 py-3">
                                        <i class="fas fa-play me-2"></i>テスト開始
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            document.getElementById('startBtn').addEventListener('click', () => {
                this.started = true;
                this.dataCollector.logInteraction('test_started', {
                    timestamp: Date.now()
                });
                this.render();
            });

        } else if (this.phase === 'cat' && !this.catDone) {
            // Vocabulary test question page
            const item = this.vocabularyItems[this.nextItem];
            const options = [item.CorrectAnswer, item.Distractor_1, item.Distractor_2, item.Distractor_3]
                .sort(() => Math.random() - 0.5); // Shuffle options
            const progressPct = Math.min(100, Math.round(100 * this.administeredItems.length / 30));
            
            // Record question start time
            this.lastQuestionStartTime = Date.now();

            app.innerHTML = `
                <div class="row pt-4 fade-in">
                    <div class="col-8 offset-2">
                        <div class="progress mb-3">
                            <div class="progress-bar bg-primary" role="progressbar" style="width: ${progressPct}%">
                                語彙テスト ${progressPct}%
                            </div>
                        </div>
                        
                        <div class="card p-4">
                            <span class="question-number">語彙問題 ${this.administeredItems.length + 1} / 30</span>
                            <span class="badge bg-secondary ms-2">Level ${item.Level}</span>
                            <span class="badge bg-info ms-2">${item.PartOfSpeech}</span>
                            <h3 class="my-4 text-center">${item.Item}</h3>
                            <p class="text-center text-muted mb-4">最も適切な英語訳を選んでください</p>
                            
                            <div class="d-grid gap-2">
                                ${options.map(option => 
                                    `<button class="btn btn-outline-primary btn-lg option-btn" data-option="${option}">${option}</button>`
                                ).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Add event listeners to option buttons
            document.querySelectorAll('.option-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    this.handleVocabResponse(e.target.getAttribute('data-option'));
                });
            });

        } else if (this.phase.startsWith('reading_')) {
            this.renderReadingPhase();

        } else if (this.phase === 'final') {
            // Final results page
            const vocabSize = Math.round(this.vocabFromTheta(this.theta));
            const accuracy = Math.round((this.responses.filter(r => r === 1).length / this.responses.length) * 100 * 10) / 10;

            app.innerHTML = `
                <div class="row pt-4 fade-in">
                    <div class="col-8 offset-2">
                        <div class="card p-4 shadow-sm text-center">
                            <h2 class="mb-4">テスト完了</h2>
                            <div class="alert alert-success">
                                <h3 class="mb-3">推定語彙サイズ: ${vocabSize} 語</h3>
                                <p>読解レベル: ${this.readingLevel}Kレベル</p>
                                <p>語彙問題正答率: ${accuracy}%</p>
                            </div>
                            <div class="mt-4">
                                <button id="downloadBtn" class="btn btn-success btn-lg me-3">
                                    <i class="fas fa-file-excel me-2"></i>結果をExcelでダウンロード
                                </button>
                                <button id="downloadJsonBtn" class="btn btn-info btn-lg me-3">
                                    <i class="fas fa-file-code me-2"></i>詳細データ (JSON)
                                </button>
                                <button id="restartBtn" class="btn btn-outline-primary btn-lg">
                                    <i class="fas fa-redo me-2"></i>再テスト
                                </button>
                            </div>
                            <div class="mt-3">
                                <small class="text-muted">Session ID: ${this.dataCollector.currentSession.sessionId}</small>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            document.getElementById('downloadBtn').addEventListener('click', () => {
                this.exportToExcel();
            });

            document.getElementById('downloadJsonBtn').addEventListener('click', () => {
                this.exportDetailedJSON();
            });

            document.getElementById('restartBtn').addEventListener('click', () => {
                if (confirm('新しいテストを開始しますか？現在のデータは保存されています。')) {
                    location.reload();
                }
            });
            
            // Log test completion
            this.dataCollector.logInteraction('test_completed', {
                finalVocabSize: vocabSize,
                accuracy: accuracy,
                totalDuration: Date.now() - this.dataCollector.currentSession.startTime.getTime()
            });
        }
    }

    renderReadingPhase() {
        const app = document.getElementById('app');
        const currentType = this.phase.replace('reading_', '');
        const typeLabel = currentType === 'narrative' ? '物語文' : '説明文';
        const questionNum = this.readingStep === 'question1' ? 1 : 2;

        if (this.readingStep === 'text') {
            // Log text presentation
            this.dataCollector.logInteraction('reading_text_shown', {
                type: currentType,
                level: this.readingLevel
            });
            
            // Show reading text
            app.innerHTML = `
                <div class="row pt-4 fade-in">
                    <div class="col-10 offset-1">
                        <div class="card p-4">
                            <div class="text-center mb-4">
                                <h4>${typeLabel}読解</h4>
                                <span class="badge bg-info">レベル ${this.readingLevel}K</span>
                            </div>
                            <div class="card p-4 mb-4" style="background-color: #f8f9fa;">
                                <div style="line-height: 1.8; font-size: 1.1em;">
                                    ${this.currentReadingText.text.split('\n').filter(p => p.trim()).map(paragraph => 
                                        `<p>${this.escapeHtml(paragraph)}</p>`
                                    ).join('')}
                                </div>
                            </div>
                            <div class="text-center">
                                <button id="continueBtn" class="btn btn-primary btn-lg">理解問題に進む</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            document.getElementById('continueBtn').addEventListener('click', () => {
                this.readingStep = 'question1';
                const currentType = this.phase.replace('reading_', '');
                this.readingTimes[currentType].question1Start = new Date();
                
                // Log reading time
                this.dataCollector.logInteraction('reading_text_finished', {
                    type: currentType,
                    readingTime: Date.now() - this.readingTimes[currentType].textStart.getTime()
                });
                
                this.render();
            });

        } else {
            // Show question
            const questionText = this.readingStep === 'question1' ? 
                this.currentReadingText.question1 : this.currentReadingText.question2;

            app.innerHTML = `
                <div class="row pt-4 fade-in">
                    <div class="col-10 offset-1">
                        <div class="row">
                            <div class="col-6">
                                <div class="card p-3" style="max-height: 500px; overflow-y: auto;">
                                    <h6 class="mb-3">${typeLabel}テキスト</h6>
                                    <div style="line-height: 1.6; font-size: 0.9em;">
                                        ${this.currentReadingText.text.split('\n').filter(p => p.trim()).map(paragraph => 
                                            `<p class="mb-2">${this.escapeHtml(paragraph)}</p>`
                                        ).join('')}
                                    </div>
                                </div>
                            </div>
                            <div class="col-6">
                                <div class="card p-4">
                                    <h5>問題 ${questionNum}</h5>
                                    <p class="mb-4">${this.escapeHtml(questionText)}</p>
                                    <textarea id="answerText" class="form-control mb-3" rows="8" 
                                              placeholder="こちらに回答を入力してください..."></textarea>
                                    <button id="submitAnswer" class="btn btn-primary btn-lg w-100">回答を提出</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Track text input
            let typingStarted = false;
            document.getElementById('answerText').addEventListener('input', (e) => {
                if (!typingStarted && e.target.value.length > 0) {
                    typingStarted = true;
                    this.dataCollector.logInteraction('answer_typing_started', {
                        question: this.readingStep,
                        type: currentType
                    });
                }
            });

            document.getElementById('submitAnswer').addEventListener('click', () => {
                const answer = document.getElementById('answerText').value.trim();
                if (answer) {
                    this.handleReadingAnswer(answer);
                } else {
                    alert('回答を入力してください。');
                }
            });
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const catTest = new VocabReadingCATTest();
});
