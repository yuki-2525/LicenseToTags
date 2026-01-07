// assets/js/pdfParser.js

class PdfParser {
    constructor() {
        this.fullText = '';
        this.items = {}; // { 'A': '回答文', ... }
    }

    /**
     * PDFファイルを読み込み、テキストを抽出する
     * @param {File} file 
     * @returns {Promise<Object>} 解析結果オブジェクト
     */
    async parse(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            
            let fullText = '';
            
            // 全ページのテキストを取得
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                // テキストアイテムを結合（改行コードなどで区切る）
                const pageText = textContent.items.map(item => item.str).join('\n');
                fullText += pageText + '\n\n';
            }

            this.fullText = fullText;
            this.extractItems();
            
            return {
                rawItems: this.items,
                rightsHolder: this.extractRightsHolder(fullText)
            };

        } catch (error) {
            console.error('PDF parsing error:', error);
            throw new Error('PDFの解析に失敗しました。PDFファイルが正しいか確認してください。');
        }
    }

    /**
     * 全文から各項目(A-X)の内容を抽出する
     * シンプルな正規表現パターンマッチング
     */
    extractItems() {
        // A. 利用主体 ... B. 法人 ... と続いている想定
        // 項目と項目の間のテキストを抽出する
        
        const itemKeys = Object.keys(VN3_ITEMS); // A, B, ... X
        
        // 抽出ロジックの改善: 
        // "A. (タイトル)" から 次の項目 "B." までの間のテキストを取得したい。
        // 単純なsplitよりも、インデックス検索の方が確実かもしれない。
        
        for (let i = 0; i < itemKeys.length; i++) {
            const currentKey = itemKeys[i];
            const nextKey = itemKeys[i + 1];
            
            // 現在の項目の開始位置を探す (例: "A. ")
            // 注意: PDFのテキスト化品質によっては "A ." とか "A. タイトル" の間に改行が入るかも
            // 簡易的に "A." + 任意の文字 + 改行 などを探す
            
            const startPattern = new RegExp(`${currentKey}\\.\\s*`, 'i');
            const match = this.fullText.match(startPattern);
            
            if (!match) {
                this.items[currentKey] = null;
                continue;
            }

            const startIndex = match.index;
            
            let endIndex = -1;
            if (nextKey) {
                // 次の項目の開始位置を探す
                const nextPattern = new RegExp(`${nextKey}\\.\\s*`, 'i');
                // startIndexより後ろで探す
                const textAfterStart = this.fullText.substring(startIndex + 10); // 少しずらす
                const nextMatch = textAfterStart.match(nextPattern);
                if (nextMatch) {
                    endIndex = startIndex + 10 + nextMatch.index;
                }
            }
            
            // 最後まで、または次の項目まで
            let content = '';
            if (endIndex !== -1) {
                content = this.fullText.substring(startIndex, endIndex);
            } else {
                // 最後の場合など
                content = this.fullText.substring(startIndex);
            }

            // ノイズ除去: 項目タイトル行を除去したいが、PDFのレイアウトによる
            // ここでは、content内に含まれる「チェックボックス的な選択肢」を探す
            // VN3ライセンスは通常、許可する項目の枠内に文章があるか、
            // 「許可します」という文言が書かれている。
            
            // 簡単のため、抽出したブロック全体を正規化して保存
            this.items[currentKey] = this.cleanText(content);
        }
    }

    /**
     * テキストのクリーニング
     */
    cleanText(text) {
        return text
            .replace(/\s+/g, ' ') // 連続する空白・改行を1つのスペースに
            .trim();
    }

    /**
     * 権利者名などを推定抽出（オプション）
     */
    extractRightsHolder(text) {
        // 簡易的な抽出：「権利者：〇〇」や「Copyright ...」を探す
        const match = text.match(/(?:権利者|Copyright)\s*[:：]\s*([^\n\r]+)/i);
        return match ? match[1].trim() : '不明な権利者';
    }
}
