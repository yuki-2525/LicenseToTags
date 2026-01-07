// assets/js/app.js

class App {
    constructor() {
        this.debugMode = false; // デバッグモード初期値
        this.config = this.loadConfig();
        this.parser = new PdfParser();
        this.history = this.loadHistory();
        
        // 状態管理用
        this.currentRawItems = {};
        this.currentShortItems = {};
        this.checkedKeys = new Set(Object.keys(VN3_ITEMS));
        // 各項目のカスタム出力ラベル（初期値はconfigから）
        this.customLabels = {};
        Object.keys(VN3_ITEMS).forEach(k => {
            this.customLabels[k] = VN3_ITEMS[k].outputLabel;
        });
        
        this.initializeUI();
        this.renderHistory();
        this.renderMappingEditor();
        this.renderResultItems(); // 初期表示
        this.updateOutput();
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
        // UI反映
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
     * ※ UI表示用ではなく、データセットアップ用のメソッドに変更
     */
    calculateShortItems(rawItems) {
        const shortItems = {};
        
        for (const key of Object.keys(VN3_ITEMS)) {
            const text = rawItems[key];
            if (!text) {
                shortItems[key] = { value: '（不明）', raw: '' };
                continue;
            }

            // マッピングルール検索
            const group = VN3_ITEMS[key].group;
            let shortText = null;

            // 特記事項(X)はマッピング設定を行わず、固定ロジックで判定
            if (key === 'X') {
                // ノイズ除去: "特記事項" の文言が先頭に含まれていたら削除
                let cleanXText = text.replace(/^特記事項[:：\s]*/, '').trim();
                
                const nonePatterns = ['なし', '特になし', '無し', 'なし。', '特になし。'];
                if (!nonePatterns.includes(cleanXText)) {
                    shortText = 'あり 要確認';
                } else {
                    shortText = 'なし';
                }
            } else {
                // 通常項目: マッピングルール検索
                
                // グループ固有
                if (this.config.mappings[group]) {
                    shortText = this.findMatch(text, this.config.mappings[group]);
                }
                // 共通
                if (!shortText && this.config.mappings['common']) {
                    shortText = this.findMatch(text, this.config.mappings['common']);
                }
                // フォールバック
                if (!shortText) {
                    shortText = text.length > 20 ? text.substring(0, 20) + '...' : text;
                }
            }

            shortItems[key] = { 
                value: shortText, 
                raw: text 
            };
        }
        return shortItems;
    }

    /**
     * UIの状態(checkedKeys)とshortItemsを元に、最終出力テキストを作成
     */
    buildOutputText() {
        if (!this.currentShortItems || Object.keys(this.currentShortItems).length === 0) return '';

        const summaryLines = [];
        const processedKeys = new Set();
        const itemKeys = Object.keys(VN3_ITEMS);

        for (const key of itemKeys) {
            // チェックされていない項目はスキップ
            if (!this.checkedKeys.has(key)) continue;
            if (processedKeys.has(key)) continue;

            const group = VN3_ITEMS[key].group;
            const groupKeys = itemKeys.filter(k => VN3_ITEMS[k].group === group);
            
            // グループ内の有効なキーだけフィルタリング
            const activeGroupKeys = groupKeys.filter(k => this.checkedKeys.has(k));
            
            // グループ統合チェックかつ、グループ内に有効な項目が複数あるか？
            // (1つだけなら個別処理と同じ扱いになるが、ロジック的には統合ルートでも問題ない)
            const shouldMerge = this.config.groups[group];

            if (shouldMerge && activeGroupKeys.length > 0) {
                // 統合処理
                const values = activeGroupKeys.map(k => this.currentShortItems[k].value);
                const isAllSame = values.every(v => v === values[0]);
                
                let lineText = '';
                const label = this.getGroupLabel(group) || group;

                if (isAllSame && values.length > 0) {
                    // 全て同じ値ならシンプルに
                    lineText = `${label}：${values[0]}`;
                } else {
                    // 違う値が含まれる場合
                     const details = activeGroupKeys.map((k, index) => {
                         // A, B キーを表示に使う
                         return `${k}:${values[index]}`;
                    });
                    lineText = `${label}：${details.join(' ')}`;
                }
                summaryLines.push(lineText);
                
                // このグループのすべてのキーを処理済みにする（activeでないものも含めてスキップ対象にする）
                groupKeys.forEach(k => processedKeys.add(k));

            } else if (this.checkedKeys.has(key)) {
                // 個別出力
                const val = this.currentShortItems[key].value;
                const label = this.customLabels[key] || VN3_ITEMS[key].outputLabel; // カスタムラベル使用
                summaryLines.push(`${label}：${val}`);
                processedKeys.add(key);
            }
        }

        return summaryLines.join('\n');
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
        // グループラベルの定義
        // ここも「ライセンス-xxx」に合わせる
        const groupLabels = {
            'AB': 'ライセンス-利用主体',
            'CE': 'ライセンス-アップロード',
            'FH': 'ライセンス-センシティブ',
            'IL': 'ライセンス-加工',
            'MN': 'ライセンス-再配布',
            'OR': 'ライセンス-メディア',
            'SU': 'ライセンス-二次創作',
            'V': 'ライセンス-クレジット',
            'W': 'ライセンス-権利譲渡',
            'X': 'ライセンス-特記'
        };
        return groupLabels[groupKey];
    }

    // --- UI レンダリング ---

    renderResultItems() {
        const container = document.getElementById('items-list');
        container.innerHTML = '';

        Object.keys(VN3_ITEMS).forEach(key => {
            const itemDef = VN3_ITEMS[key];
            const result = this.currentShortItems[key] || { value: '未解析', raw: '' };
            const isChecked = this.checkedKeys.has(key);
            const currentLabel = this.customLabels[key] || itemDef.outputLabel;

            const row = document.createElement('div');
            row.className = 'p-3 hover:bg-blue-50 transition flex items-start group';
            
            row.innerHTML = `
                <div class="flex items-center h-5 mt-2">
                    <input type="checkbox" data-key="${key}" class="item-checkbox form-checkbox h-4 w-4 text-primary rounded border-gray-300 focus:ring-primary" ${isChecked ? 'checked' : ''}>
                </div>
                <div class="ml-3 flex-1">
                    <div class="flex flex-col md:flex-row md:items-center gap-2 mb-1">
                        <span class="text-xs text-gray-400 font-mono w-4">${key}</span>
                        <!-- 編集可能なラベル -->
                        <input type="text" class="label-input text-sm font-bold text-gray-700 border-b border-transparent hover:border-gray-300 focus:border-primary focus:outline-none bg-transparent w-full md:w-auto md:min-w-[150px]" 
                               value="${currentLabel}" data-key="${key}">
                        
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 whitespace-nowrap">
                            ${result.value}
                        </span>
                    </div>
                    <div class="text-xs text-gray-500 pl-6">
                        <span class="text-gray-400 text-[10px] block">${itemDef.label}</span>
                        <p class="mt-1 line-clamp-2 hover:line-clamp-none transition-all cursor-help" title="${(result.raw || '').replace(/"/g, '&quot;')}">
                            ${result.raw || '（原文なし）'}
                        </p>
                    </div>
                </div>
            `;
            
            // チェックボックスイベント
            row.querySelector('.item-checkbox').addEventListener('change', (e) => {
                if(e.target.checked) {
                    this.checkedKeys.add(key);
                } else {
                    this.checkedKeys.delete(key);
                }
                this.updateOutput();
            });

            // ラベル編集イベント
            row.querySelector('.label-input').addEventListener('input', (e) => {
                const newLabel = e.target.value;
                this.customLabels[key] = newLabel;
                this.updateOutput();
            });

            container.appendChild(row);
        });


        // 「全て選択/解除」機能
        const selectAllBtn = document.getElementById('select-all-btn');
        // イベント重複防止のためcloneして置換
        const newBtn = selectAllBtn.cloneNode(true);
        selectAllBtn.parentNode.replaceChild(newBtn, selectAllBtn);
        
        newBtn.addEventListener('click', () => {
            const allKeys = Object.keys(VN3_ITEMS);
            if (this.checkedKeys.size === allKeys.length) {
                // 全解除
                this.checkedKeys.clear();
            } else {
                // 全選択
                this.checkedKeys = new Set(allKeys);
            }
            this.renderResultItems(); // 再描画してチェック状態反映
            this.updateOutput();
        });
    }

    updateOutput() {
        const text = this.buildOutputText();
        document.getElementById('output-text').value = text;
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
        const fetchBtn = document.getElementById('fetch-url-btn');
        fetchBtn.addEventListener('click', () => {
            const url = document.getElementById('url-input').value;
            if (url) {
                this.handleUrl(url);
            }
        });

        // デバッグモード切替 (右クリック)
        fetchBtn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.debugMode = !this.debugMode;
            
            // UIフィードバック
            const originalText = fetchBtn.getAttribute('data-original-text') || '取得';
            // クラス操作による視覚フィードバック
            if(this.debugMode) {
                fetchBtn.textContent = 'Debug ON';
                fetchBtn.classList.remove('bg-primary', 'hover:bg-primary-dark');
                fetchBtn.classList.add('bg-red-600', 'hover:bg-red-700');
            } else {
                fetchBtn.textContent = 'Debug OFF';
                fetchBtn.classList.remove('bg-red-600', 'hover:bg-red-700');
                fetchBtn.classList.add('bg-gray-500'); // 一時的にグレーに
            }

            // 1.5秒後に元に戻す
            setTimeout(() => {
                // テキストを戻す（ロード中などの状態でない場合のみ）
                if(!fetchBtn.disabled) {
                    fetchBtn.textContent = originalText;
                }
                // アニメーション的にクラスを元に戻す
                fetchBtn.classList.remove('bg-red-600', 'hover:bg-red-700', 'bg-gray-500');
                fetchBtn.classList.add('bg-primary', 'hover:bg-primary-dark');
            }, 1500);
            
            console.log(`Debug Mode changed to: ${this.debugMode}`);
        });
        
        // Prevent dropzone click when clicking input
        document.getElementById('url-input').addEventListener('click', (e) => e.stopPropagation());

        // Group Settings (Checkboxes)
        const checkboxes = document.querySelectorAll('input[data-group]');
        checkboxes.forEach(cb => {
            const group = cb.dataset.group;
            cb.checked = !!this.config.groups[group]; // 初期状態反映
            cb.addEventListener('change', (e) => {
                this.config.groups[group] = e.target.checked;
                this.saveConfig();
                this.updateOutput(); // 再生成
            });
        });

        // Copy Button
        document.getElementById('copy-btn').addEventListener('click', () => {
            const text = document.getElementById('output-text').value;
            if (text) {
                navigator.clipboard.writeText(text).then(() => {
                    // 自動保存
                    // 現在表示中のタイトルと権利者を取得
                    const currentTitle = document.getElementById('file-title').textContent || '利用規約';
                    const currentRights = document.getElementById('file-rights').textContent || '権利者：不明';
                    // "権利者："の接頭辞を除去して保存するか、そのまま表示用として保存するか
                    // 要望は「履歴には"○○利用規約"と"権利者：××"を表示する」なので、そのまま保存したほうが楽

                    this.addHistory({
                        date: new Date().toLocaleString(),
                        content: text, // 表示用にコピー時のテキストも保存
                        rawItems: JSON.parse(JSON.stringify(this.currentRawItems)), // 元データを完全保存
                        title: currentTitle,
                        rights: currentRights
                    });

                    // ボタンの見た目を変える
                    const btn = document.getElementById('copy-btn');
                    const originalText = btn.textContent;
                    btn.textContent = 'コピー＆保存完了!';
                    setTimeout(() => btn.textContent = originalText, 2000);
                });
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
            
            // 再計算と再描画
            this.currentShortItems = this.calculateShortItems(this.currentRawItems);
            this.renderResultItems();
            this.updateOutput();

            alert('設定を保存しました');
        });
    }

    handleFile(file) {
        if (!file) return;
        
        // ローディング表示
        document.body.style.cursor = 'wait';
        
        // async/awaitを使うため、ここを即時関数でラップするか、メソッド自体をasyncのまま修正済みとする
        // 以前の修正で async handleFile になっている前提
        this.processFile(file);
    }

    async processFile(file) {
        try {
            const result = await this.parser.parse(file);
            
            // データ保存
            this.currentRawItems = result.rawItems;
            this.currentShortItems = this.calculateShortItems(result.rawItems);
            // 初期状態は全選択
            this.checkedKeys = new Set(Object.keys(VN3_ITEMS));
            
            // タイトルと権利者情報をUIに反映
            const title = result.title || '（タイトル不明）';
            const rights = result.rightsHolder || '（権利者不明）';
            
            const fileInfoArea = document.getElementById('file-info-area');
            const fileTitle = document.getElementById('file-title');
            const fileRights = document.getElementById('file-rights');
            
            fileInfoArea.classList.remove('hidden');
            fileTitle.textContent = title;
            fileTitle.dataset.fullTitle = title; // データ属性に保持
            fileRights.textContent = `権利者：${rights}`;
            fileRights.dataset.fullRights = rights;

            // UIレンダリング
            document.getElementById('result-area').classList.remove('hidden'); 
            
            // meta表示用（一応残す）
            document.getElementById('result-meta').textContent = `${title}`;
            
            this.renderResultItems();
            this.updateOutput();

        } catch (error) {
            alert(error.message);
            console.error(error);
        } finally {
            document.body.style.cursor = 'default';
        }
    }


    async handleUrl(url) {
        // デバッグ出力用ヘルパー
        const debug = (...args) => this.debugMode && console.log(...args);
        const debugGroup = (...args) => this.debugMode && console.group(...args);
        const debugGroupEnd = () => this.debugMode && console.groupEnd();
        const debugError = (...args) => this.debugMode && console.error(...args);

        debugGroup('URL Fetch Debug Info');
        debug('Input URL:', url);

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
            debug('Detected Google Drive URL. Converted to:', targetUrl);
        } else {
            debug('Using URL as is:', targetUrl);
        }

        // CORS回避のためプロキシ経由 (corsproxy.ioを使用)
        // 注意: 外部サービス依存のため、永続性が必要な場合は自前プロキシを推奨
        // const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
        debug('Proxy URL:', proxyUrl);

        try {
            document.getElementById('fetch-url-btn').textContent = '取得中...';
            document.getElementById('fetch-url-btn').disabled = true;

            const response = await fetch(proxyUrl);
            debug('Response Status:', response.status);
            if (this.debugMode) console.log('Response Headers:', [...response.headers.entries()]);

            if (!response.ok) throw new Error(`ファイルの取得に失敗しました。Status: ${response.status}`);
            
            const blob = await response.blob();
            debug('Fetched Blob:', blob);
            debug('Blob Type:', blob.type);
            debug('Blob Size:', blob.size);

            // Google Driveの場合、HTMLが返ってくることがある（アクセス権限なしなど）
            if (blob.type.includes('text/html')) {
                const textPreview = await blob.text(); // for debug preview
                if (this.debugMode) console.warn('Response was HTML. Preview:', textPreview.substring(0, 200));
                // バイナリとして扱い直すのは難しいのでエラーにする
                throw new Error('PDFとして読み込めませんでした。Google Driveのアクセス権限（リンクを知っている全員）を確認してください。');
            }

            const file = new File([blob], "downloaded.pdf", { type: "application/pdf" });
            this.handleFile(file);

        } catch (error) {
            debugError('Fetch Error Detail:', error);
            alert(`URLからの読み込みエラー: ${error.message}`);
        } finally {
            document.getElementById('fetch-url-btn').textContent = '取得';
            document.getElementById('fetch-url-btn').disabled = false;
            debugGroupEnd();
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
            div.className = 'p-3 bg-gray-50 rounded border border-gray-200 hover:bg-gray-100 transition cursor-pointer text-xs';
            
            // 旧データ互換: metaがある場合はそれを使い、なければtitle/rightsを使う
            const titleStr = item.title || item.meta || '利用規約';
            const rightsStr = item.rights || '';

            div.innerHTML = `
                <div class="mb-1">
                    <div class="font-bold text-gray-700 truncate">${titleStr}</div>
                    <div class="flex justify-between text-gray-400 mt-1">
                        <span>${rightsStr}</span>
                        <span>${(item.date || '').split(' ')[0]}</span>
                    </div>
                </div>
                <div class="text-gray-500 truncate font-mono bg-white p-1 rounded border border-gray-100">${item.content}</div>
            `;
            // クリックで復元
            div.addEventListener('click', () => {
                document.getElementById('result-area').classList.remove('hidden');
                const outText = document.getElementById('output-text');
                
                // タイトル等も復元
                document.getElementById('file-info-area').classList.remove('hidden');
                document.getElementById('file-title').textContent = titleStr;
                document.getElementById('file-rights').textContent = rightsStr;

                if (item.rawItems) {
                    // 全データ復元モード (新しい履歴データ)
                    this.currentRawItems = item.rawItems;
                    this.currentShortItems = this.calculateShortItems(this.currentRawItems);
                    // 初期状態(全選択)に戻すかどうかは仕様次第だが、元データからの再編集という観点では全選択が自然
                    this.checkedKeys = new Set(Object.keys(VN3_ITEMS));
                    
                    // UIの完全復元
                    this.renderResultItems();
                    this.updateOutput();
                    
                    // テキストエリアは通常表示に戻す（編集できないモード解除）
                    outText.className = "hidden"; // renderResultItems内でhidden制御されるが念のため
                    document.getElementById('result-meta').textContent = titleStr; // Stickyヘッダーの更新

                } else {
                    // テキストのみ復元モード (古い履歴データ)
                    outText.value = item.content;
                    
                    // テキストエリアを表示・整形
                    outText.classList.remove('hidden');
                    outText.className = "w-full mt-2 p-2 border border-blue-100 rounded bg-white text-sm font-mono h-64 focus:ring-2 focus:ring-blue-300 focus:outline-none";
                    
                    // 個別項目は見えなくする
                    document.getElementById('items-list').innerHTML = `
                        <div class="p-8 text-center text-gray-400">
                            <p>履歴からテキストのみを読み込みました。</p>
                            <p class="text-xs mt-2">※ 元の解析データは保存されていないため、個別項目の再編集はできません。</p>
                        </div>
                    `;
                }

                // スクロール
                document.getElementById('result-area').scrollIntoView({ behavior: 'smooth' });
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
