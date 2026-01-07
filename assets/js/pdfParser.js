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
                
                // テキストアイテムを行ごとに結合（y座標を使用）
                let lastY = -1;
                let pageText = '';
                // items配列は通常読み取り順だが、念のためy降順x昇順でソート（簡易）
                // ただしPDF.jsのデフォルトでも大体合っていることが多いので、まずはそのまま処理
                // 厳密なソートを入れると重くなるため、まずはストリーム順でy差分を見る
                
                for (const item of textContent.items) {
                    const y = item.transform[5]; // transform: [scaleX, skewY, skewX, scaleY, x, y]
                    const str = item.str;
                    
                    if (str.trim().length === 0) continue; // 空白のみのアイテムは無視（連結時にスペース入れる判定に使ってもいいが、簡易化）

                    if (lastY !== -1 && Math.abs(y - lastY) > 8) { // 行の高さ差分閾値（フォントサイズによるが、適当に大きめに）
                        pageText += '\n';
                    } else if (lastY !== -1) {
                         // 同じ行ならスペース入れて繋ぐ（日本語の場合は本当は入れない方がいいこともあるが、英語混じりだと必要）
                         // 簡易的に末尾が英数字ならスペース入れると良さそうだが、一旦なしで
                    }
                    
                    pageText += str;
                    lastY = y;
                }
                
                fullText += pageText + '\n\n';
            }

            //console.log(fullText); // デバッグ用

            this.fullText = fullText;
            this.extractItems();
            
            return {
                rawItems: this.items,
                rightsHolder: this.extractRightsHolder(fullText),
                title: this.extractTitle(fullText)
            };

        } catch (error) {
            console.error('PDF parsing error:', error);
            throw new Error('PDFの解析に失敗しました。PDFファイルが正しいか確認してください。');
        }
    }

    /**
     * 全文から各項目(A-X)の内容を抽出する
     * ページ7「2.利用条件」以降を対象とする
     * 行ベースで処理し、セクション区切りなどのノイズを除去する
     */
    extractItems() {
        // VN3ライセンスの構造上、「2.利用条件」というセクション以降に
        // 具体的な許諾内容（A. XX ...）が記載されている。
        
        let searchStartIndex = this.fullText.search(/2\.\s*利用条件/);
        
        // 見つからない場合のフォールバック
        if (searchStartIndex === -1) {
            searchStartIndex = this.fullText.search(/個別条件/);
        }
        
        const searchText = searchStartIndex !== -1 
            ? this.fullText.substring(searchStartIndex) 
            : this.fullText;

        // 行ごとに分割して解析
        const lines = searchText.split(/\r\n|\r|\n/);
        
        // 結果初期化
        Object.keys(VN3_ITEMS).forEach(k => this.items[k] = '');

        let currentKey = null;
        let currentBuffer = [];

        // 判定用Regex (全角半角対応)
        const itemKeyPattern = /^([A-XＡ-Ｘ])[\.．]\s*/;  
        const sectionPattern = /^(\(\d+\)|（\d+）|\d+[\.．])/; // 区切り判定も広めに

        for (let line of lines) {
            // (参考資料) は共通部分なので削除
            line = line.replace(/[（\(]参考資料[）\)]/g, '');

            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            // 「利用規約」セクション（共通部分）が始まったら解析終了
            // 例: "3. 利用規約", "利用規約" などのヘッダーを検出
            if (/^(\d+[\.．]?\s*)?利用規約$/.test(trimmedLine)) {
                break;
            }

            // 新しい項目の開始判定
            const keyMatch = trimmedLine.match(itemKeyPattern);
            if (keyMatch) {
                // 前の項目があれば保存して終了
                if (currentKey) {
                    this.items[currentKey] = this.cleanText(currentBuffer.join(' '));
                }

                // 全角を半角へ正規化
                const rawKey = keyMatch[1];
                const newKey = String.fromCharCode(rawKey.charCodeAt(0) - (rawKey > 'Z' ? 0xFEE0 : 0));

                if (VN3_ITEMS[newKey]) {
                    currentKey = newKey;
                    // キー部分（"A."など）を除去して本文バッファへ
                    // Regex全体マッチを使って除去
                    const body = trimmedLine.substring(keyMatch[0].length);
                    currentBuffer = body ? [body] : [];
                    continue;
                } else {
                    currentKey = null; // 知らないキーなら無視
                }
            }

            // セクション区切り判定（収集中のみ）
            // 例: (2)オンラインサービスへの... や 3. 特記事項
            if (currentKey) {
                // 特定の共通注釈（フッター的記述）が来たら終了
                if (trimmedLine.startsWith('上記の利用の許可には')) {
                    this.items[currentKey] = this.cleanText(currentBuffer.join(' '));
                    currentKey = null;
                    currentBuffer = [];
                    continue;
                }

                if (sectionPattern.test(trimmedLine)) {
                    // 区切りが来たら収集終了
                    this.items[currentKey] = this.cleanText(currentBuffer.join(' '));
                    currentKey = null;
                    currentBuffer = [];
                    continue;
                }
                // バッファに追加
                currentBuffer.push(trimmedLine);
            }
        }
        
        // 最後の項目を保存
        if (currentKey) {
            this.items[currentKey] = this.cleanText(currentBuffer.join(' '));
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
     * 権利者名などを推定抽出
     * "権利者:××" の形式を優先的に探す
     */
    extractRightsHolder(text) {
        // "権利者:××" のパターンを検索
        const match = text.match(/権利者\s*[:：]\s*([^\n\r]+)/);
        if (match) {
            return match[1].trim();
        }

        // フォールバック: Copyright記載などの検索
        const copyrightMatch = text.match(/Copyright\s*[:：]?\s*([^\n\r]+)/i);
        if (copyrightMatch) {
            return copyrightMatch[1].trim();
        }

        return '不明な権利者';
    }

    /**
     * 利用規約のタイトルを抽出
     * 1. 「○○利用規約」という単体の行を探す
     * 2. なければ「(参考資料)○○利用規約による...」から抽出
     */
    extractTitle(text) {
        const lines = text.split(/\r\n|\r|\n/);
        
        // 1. 単体の行としての「○○利用規約」を探す
        for (const line of lines) {
            const trim = line.trim();
            if (!trim) continue;

            // (参考資料)で始まらず、かつ「利用規約」で終わる短い行
            if (trim.endsWith('利用規約') && !/^[（\(]参考資料[）\)]/.test(trim)) {
                // 長すぎる行は本文の可能性があるので除外（50文字以下とした）
                if (trim.length < 50) {
                    return trim;
                }
            }
        }

        // 2. 見つからない場合: (参考資料)...から抽出
        // パターン: (参考資料)○○利用規約による許諾範囲の簡易一覧
        const refMatch = text.match(/[（\(]参考資料[）\)](.*利用規約)による許諾範囲の簡易一覧/);
        if (refMatch) {
            return refMatch[1].trim();
        }

        return '利用規約';
    }
}
