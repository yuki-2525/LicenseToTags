// assets/js/app.js

class App {
    constructor() {
        this.config = this.loadConfig();
        this.parser = new PdfParser();
        this.history = this.loadHistory();
        
        this.initializeUI();
        this.renderHistory();
        this.renderMappingEditor();
    }

    // --- 設定管理 ---

    loadConfig() {
        const stored = localStorage.getItem('vn3_config');
        return stored ? JSON.parse(stored) : JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }

    saveConfig() {
        localStorage.setItem('vn3_config', JSON.stringify(this.config));
    }

    resetConfig() {
        this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        this.saveConfig();
        this.renderMappingEditor();
        // UI反映（Prefixなど）
        document.getElementById('prefix-input').value = this.config.prefix;
        this.updateGroupCheckboxes();
    }

    // --- 履歴管理 ---

    loadHistory() {
        const stored = localStorage.getItem('vn3_history');
        return stored ? JSON.parse(stored) : [];
    }

    addHistory(item) {
        // 重複チェックとか上限設定とかしてもいい
        this.history.unshift(item); // 先頭に追加
        if (this.history.length > 50) this.history.pop(); // 最大50件
        localStorage.setItem('vn3_history', JSON.stringify(this.history));
        this.renderHistory();
    }

    clearHistory() {
        this.history = [];
        localStorage.removeItem('vn3_history');
        this.renderHistory();
    }

    // --- ロジックコア ---

    /**
     * PDF解析結果(rawItems)を元に、設定(mappings)に従って短縮表現テキストを生成
     */
    generateSummary(rawItems) {
        const resultItems = {}; // { 'A': 'OK', 'B': 'NG', ... }
        
        // 1. 各項目のテキストを解析し、マッピングに当てはめる
        for (const key of Object.keys(VN3_ITEMS)) {
            const text = rawItems[key];
            if (!text) {
                resultItems[key] = '（不明）';
                continue;
            }

            // マッピングルール検索
            // グループ固有のマッピングがあれば優先、なければ共通(common)、なければデフォルトロジック
            const group = VN3_ITEMS[key].group;
            
            // グループ固有マッピング
            let shortText = null;
            if (this.config.mappings[group]) {
                shortText = this.findMatch(text, this.config.mappings[group]);
            }
            
            // 共通マッピング
            if (!shortText && this.config.mappings['common']) {
                shortText = this.findMatch(text, this.config.mappings['common']);
            }
            
            // ヒットしなければ原文の一部を切り出すか、そのまま（長すぎる場合はカット）
            if (!shortText) {
                // フォールバック: テキストから意味ありげな文言を探す...のは難しいので
                // 仮に「要確認」とするか、テキストの先頭を表示
                shortText = text.length > 20 ? text.substring(0, 20) + '...' : text;
            }

            resultItems[key] = shortText;
        }

        // 2. グループ化設定に従って結合
        const summaryLines = [];
        
        // 処理済みキー管理
        const processedKeys = new Set();

        const itemKeys = Object.keys(VN3_ITEMS);
        
        for (const key of itemKeys) {
            if (processedKeys.has(key)) continue;

            const group = VN3_ITEMS[key].group;
            const groupKeys = itemKeys.filter(k => VN3_ITEMS[k].group === group);
            
            // このグループが「統合する」設定になっているか？
            const shouldMerge = this.config.groups[group];

            if (shouldMerge && groupKeys.length > 1) {
                // 統合処理 (例: A-B)
                // 全て同じ値なら1つにまとめる、違うなら列挙する
                const values = groupKeys.map(k => resultItems[k]);
                const isAllSame = values.every(v => v === values[0]);
                
                let lineText = '';
                const label = this.getGroupLabel(group) || `${groupKeys[0]}-${groupKeys[groupKeys.length-1]}`;

                if (isAllSame) {
                    lineText = `${label}：${values[0]}`;
                } else {
                    // 違う場合: A:OK / B:NG のように並べるか、単純に列挙
                    // VN3ライセンスの各項目名を短縮して表示
                    const details = groupKeys.map((k, index) => {
                         // A, B, ... のキーを表示に使うのは直感的でない場合があるので、
                         // 項目定義から簡易ラベルを取得したいが、ここでは簡易的にキー+値にする
                         // または、config.jsにshortLabelを持たせるなどの拡張も考えられる
                         
                         // 例: "個人OK/法人NG" のようにしたい
                         // VN3_ITEMSにshort属性を追加して対応するのがベストだが、
                         // ここではキー(A,B...)を使って "A(個人):OK" のようにするか
                         // ユーザーは簡潔さを求めているので "A:OK / B:NG" とする
                         return `${k}:${values[index]}`;
                    });
                    
                    lineText = `${label}：${details.join(' ')}`; // スペース区切りに変更 (スラッシュ多用を避ける)
                }
                summaryLines.push(lineText);
                
                // グループ内のキーをすべて処理済みにする
                groupKeys.forEach(k => processedKeys.add(k));

            } else {
                // 個別出力
                // ラベルは項目定義から取得
                const def = VN3_ITEMS[key];
                // 少しラベルが長いので、記号 + 簡易名に加工してもいいかも
                // 例: "A. 個人による利用" -> "A" とか "個人利用"
                // ここではシンプルに定義ラベルを使うか、キーを使う
                summaryLines.push(`${key}：${resultItems[key]}`);
                processedKeys.add(key);
            }
        }

        return this.config.prefix + ' ' + summaryLines.join(' / ');
    }

    findMatch(text, mappingList) {
        for (const rule of mappingList) {
            if (text.includes(rule.pattern)) {
                return rule.short;
            }
        }
        return null;
    }

    getGroupLabel(groupKey) {
        // グループラベルの定義（簡易）
        const groupLabels = {
            'AB': '利用主体',
            'CE': 'アップロード',
            'FH': 'センシティブ',
            'IL': '加工',
            'MN': '再配布',
            'OR': 'メディア',
            'SU': '二次創作',
            'V': 'クレジット',
            'W': '権利譲渡',
            'X': '特記'
        };
        return groupLabels[groupKey];
    }

    // --- UI 操作 ---

    initializeUI() {
        // Drag & Drop
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');

        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => this.handleFile(e.target.files[0]));
        
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-active');
        });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-active'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-active');
            if (e.dataTransfer.files.length) {
                this.handleFile(e.dataTransfer.files[0]);
            }
        });

        // URL Fetch Button
        document.getElementById('fetch-url-btn').addEventListener('click', () => {
            const url = document.getElementById('url-input').value;
            if (url) {
                this.handleUrl(url);
            }
        });
        
        // Prevent dropzone click when clicking input
        document.getElementById('url-input').addEventListener('click', (e) => e.stopPropagation());

        // Prefix Input
        const prefixInput = document.getElementById('prefix-input');
        prefixInput.value = this.config.prefix;
        prefixInput.addEventListener('change', (e) => {
            this.config.prefix = e.target.value;
            this.saveConfig();
        });

        // Group Settings (Checkboxes)
        const checkboxes = document.querySelectorAll('input[data-group]');
        checkboxes.forEach(cb => {
            const group = cb.dataset.group;
            cb.checked = !!this.config.groups[group]; // 初期状態反映
            cb.addEventListener('change', (e) => {
                this.config.groups[group] = e.target.checked;
                this.saveConfig();
            });
        });

        // Copy Button
        document.getElementById('copy-btn').addEventListener('click', () => {
            const text = document.getElementById('output-text').value;
            if (text) {
                navigator.clipboard.writeText(text).then(() => {
                    alert('コピーしました！');
                });
            }
        });

        // Save History Button
        document.getElementById('save-history-btn').addEventListener('click', () => {
            const text = document.getElementById('output-text').value;
            const meta = document.getElementById('result-meta').textContent;
            if (text) {
                this.addHistory({
                    date: new Date().toLocaleString(),
                    content: text,
                    meta: meta
                });
                alert('履歴に保存しました');
            }
        });

        // Clear History
        document.getElementById('clear-history-btn').addEventListener('click', () => {
             if(confirm('履歴を全て消去しますか？')) {
                 this.clearHistory();
             }
        });

        // Settings Modal
        const modal = document.getElementById('settings-modal');
        document.getElementById('open-settings-btn').addEventListener('click', () => {
            this.renderMappingEditor();
            modal.classList.remove('hidden');
        });
        document.getElementById('close-settings-btn').addEventListener('click', () => modal.classList.add('hidden'));
        document.getElementById('save-settings-btn').addEventListener('click', () => {
            this.saveMappingsFromEditor();
            this.saveConfig();
            modal.classList.add('hidden');
            alert('設定を保存しました');
        });
        document.getElementById('reset-settings-btn').addEventListener('click', () => {
            if(confirm('設定を初期値に戻しますか？')) {
                this.resetConfig();
            }
        });
    }

    async handleFile(file) {
        if (!file || file.type !== 'application/pdf') {
            alert('PDFファイルを選択してください');
            return;
        }

        try {
             // UI Loading state
            document.body.style.cursor = 'wait';
            
            // ローディング表示とか入れたほうが親切だが省略
            const result = await this.parser.parse(file);
            
            // 解析結果を生成
            const summary = this.generateSummary(result.rawItems);
            
            // 結果表示
            document.getElementById('result-area').classList.remove('hidden');
            document.getElementById('output-text').value = summary;
            document.getElementById('result-meta').textContent = `権利者: ${result.rightsHolder} (${new Date().toLocaleString()})`;

        } catch (error) {
            alert(error.message);
        } finally {
            document.body.style.cursor = 'default';
        }
    }

    async handleUrl(url) {
        // Google Drive URLの変換ロジック
        // https://drive.google.com/file/d/1n8n3_.../view?usp=sharing
        // -> ID: 1n8n3_...
        
        let targetUrl = url;
        let isGoogleDrive = false;

        const driveMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (driveMatch && driveMatch[1]) {
            const fileId = driveMatch[1];
            targetUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
            isGoogleDrive = true;
        }

        // CORS回避のためプロキシ経由 (AllOriginsを使用)
        // 注意: 外部サービス依存のため、永続性が必要な場合は自前プロキシを推奨
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;

        try {
            document.getElementById('fetch-url-btn').textContent = '取得中...';
            document.getElementById('fetch-url-btn').disabled = true;

            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error('ファイルの取得に失敗しました。URLを確認してください。');
            
            const blob = await response.blob();
            // Google Driveの場合、HTMLが返ってくることがある（アクセス権限なしなど）
            if (blob.type.includes('text/html')) {
                throw new Error('PDFとして読み込めませんでした。Google Driveのアクセス権限（リンクを知っている全員）を確認してください。');
            }

            const file = new File([blob], "downloaded.pdf", { type: "application/pdf" });
            this.handleFile(file);

        } catch (error) {
            alert(`URLからの読み込みエラー: ${error.message}`);
        } finally {
            document.getElementById('fetch-url-btn').textContent = '取得';
            document.getElementById('fetch-url-btn').disabled = false;
        }
    }

    renderHistory() {
        const list = document.getElementById('history-list');
        list.innerHTML = '';
        
        if (this.history.length === 0) {
            list.innerHTML = '<p class="text-center text-gray-400 py-4 text-sm">履歴はありません</p>';
            return;
        }

        this.history.forEach(item => {
            const div = document.createElement('div');
            div.className = 'p-3 bg-gray-50 rounded border border-gray-200 hover:bg-gray-100 transition cursor-pointer';
            div.innerHTML = `
                <div class="flex justify-between text-xs text-gray-500 mb-1">
                    <span>${item.date}</span>
                    <span>${item.meta || ''}</span>
                </div>
                <div class="text-sm text-gray-700 truncate font-mono">${item.content}</div>
            `;
            // クリックで復元
            div.addEventListener('click', () => {
                document.getElementById('result-area').classList.remove('hidden');
                document.getElementById('output-text').value = item.content;
                document.getElementById('result-meta').textContent = item.meta || '';
            });
            list.appendChild(div);
        });
    }

    renderMappingEditor() {
        const editor = document.getElementById('mapping-editor');
        editor.innerHTML = '';

        // Mappingsを表示、編集できるようにする
        // グループごと
        const groups = {
            'common': '共通ルール（優先度低）',
            'AB': 'A-B 利用主体',
            'CE': 'C-E アップロード',
            'FH': 'F-H センシティブ',
            'IL': 'I-L 加工',
            'MN': 'M-N 再配布',
            'OR': 'O-R メディア・プロダクト',
            'SU': 'S-U 二次創作',
            'V': 'V クレジット',
            'W': 'W 権利譲渡'
        };

        for (const [groupKey, groupName] of Object.entries(groups)) {
            const section = document.createElement('div');
            section.className = 'border-b pb-4';
            
            const title = document.createElement('h3');
            title.className = 'font-bold text-gray-700 mb-2';
            title.textContent = groupName;
            section.appendChild(title);

            const rulesDiv = document.createElement('div');
            rulesDiv.className = 'space-y-2';
            rulesDiv.dataset.group = groupKey;

            const rules = this.config.mappings[groupKey] || [];
            
            const createRow = (pattern, short) => {
                const row = document.createElement('div');
                row.className = 'flex gap-2 items-center';
                row.innerHTML = `
                    <input type="text" class="pattern-input w-2/3 p-2 border rounded text-xs" placeholder="検索パターン" value="${pattern}">
                    <span class="text-gray-400">→</span>
                    <input type="text" class="short-input w-1/3 p-2 border rounded text-xs" placeholder="短縮名" value="${short}">
                    <button class="remove-row text-red-400 hover:text-red-600 px-2">&times;</button>
                `;
                row.querySelector('.remove-row').addEventListener('click', () => row.remove());
                return row;
            };

            rules.forEach(rule => {
                rulesDiv.appendChild(createRow(rule.pattern, rule.short));
            });

            // 新規追加ボタン
            const addBtn = document.createElement('button');
            addBtn.className = 'text-xs text-primary hover:text-blue-700 mt-2';
            addBtn.textContent = '+ ルールを追加';
            addBtn.addEventListener('click', () => {
                rulesDiv.appendChild(createRow('', ''));
            });

            section.appendChild(rulesDiv);
            section.appendChild(addBtn);
            editor.appendChild(section);
        }
    }

    saveMappingsFromEditor() {
        const editor = document.getElementById('mapping-editor');
        const groups = editor.querySelectorAll('[data-group]');
        const newMappings = {};

        groups.forEach(groupDiv => {
            const groupKey = groupDiv.dataset.group;
            const rows = groupDiv.children;
            const rules = [];
            for (const row of rows) {
                const pattern = row.querySelector('.pattern-input')?.value.trim();
                const short = row.querySelector('.short-input')?.value.trim();
                if (pattern && short) {
                    rules.push({ pattern, short });
                }
            }
            if (rules.length > 0) {
                newMappings[groupKey] = rules;
            }
        });

        // 既存の設定を上書き
        this.config.mappings = {
            ...this.config.mappings, // 編集画面にないグループがあれば残す
            ...newMappings
        };
    }
    
    updateGroupCheckboxes() {
        const checkboxes = document.querySelectorAll('input[data-group]');
        checkboxes.forEach(cb => {
            const group = cb.dataset.group;
            cb.checked = !!this.config.groups[group];
        });
    }
}

// アプリケーション起動
window.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
