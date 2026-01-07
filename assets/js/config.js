// assets/js/config.js

// VN3ライセンスの各項目定義
const VN3_ITEMS = {
    // A-B: 利用主体
    'A': { label: 'A. 個人による利用', group: 'AB', outputLabel: 'ライセンス-個人利用' },
    'B': { label: 'B. 法人による利用', group: 'AB', outputLabel: 'ライセンス-法人利用' },
    
    // C-E: オンラインサービスへのアップロード
    'C': { label: 'C. ソーシャルコミュニケーションプラットフォームへの利用', group: 'CE', outputLabel: 'ライセンス-SNS利用' },
    'D': { label: 'D. オンラインゲームプラットフォームへの利用', group: 'CE', outputLabel: 'ライセンス-オンラインゲーム利用' },
    'E': { label: 'E. コンテンツ共有プラットフォームへの利用', group: 'CE', outputLabel: 'ライセンス-コンテンツ共有利用' },
    
    // F-H: センシティブな表現
    'F': { label: 'F. 性的表現での利用', group: 'FH', outputLabel: 'ライセンス-性的表現' },
    'G': { label: 'G. 暴力を伴う表現での利用', group: 'FH', outputLabel: 'ライセンス-暴力表現' },
    'H': { label: 'H. 政治活動・宗教活動での利用', group: 'FH', outputLabel: 'ライセンス-政治宗教' },
    
    // I-L: 加工
    'I': { label: 'I. 加工・調整', group: 'IL', outputLabel: 'ライセンス-加工調整' },
    'J': { label: 'J. 改変', group: 'IL', outputLabel: 'ライセンス-改変' },
    'K': { label: 'K. 他のデータとの改変・結合', group: 'IL', outputLabel: 'ライセンス-改変結合' },
    'L': { label: 'L. 調整・改変の外部委託', group: 'IL', outputLabel: 'ライセンス-調整委託' },
    
    // M-N: 再配布
    'M': { label: 'M. 再配布', group: 'MN', outputLabel: 'ライセンス-再配布' },
    'N': { label: 'N. 改変したデータの配布', group: 'MN', outputLabel: 'ライセンス-改変配布' },
    
    // O-R: メディア・プロダクト利用
    'O': { label: 'O. 映像作品・配信・放送への利用', group: 'OR', outputLabel: 'ライセンス-映像配信' },
    'P': { label: 'P. 出版物・電子出版物への利用', group: 'OR', outputLabel: 'ライセンス-出版' },
    'Q': { label: 'Q. 有体物（グッズ）への利用', group: 'OR', outputLabel: 'ライセンス-グッズ' },
    'R': { label: 'R. 製品開発等のためのソフトウェアへの組み込み', group: 'OR', outputLabel: 'ライセンス-ソフト組込' },
    
    // S-U: 二次創作
    'S': { label: 'S. キャラクターや意匠を利用したアバターやモデルの作成', group: 'SU', outputLabel: 'ライセンス-アバター作成' },
    'T': { label: 'T. コスプレ衣装の作成', group: 'SU', outputLabel: 'ライセンス-コスプレ' },
    'U': { label: 'U. 既存のキャラクターや意匠を利用した二次的著作物の作成', group: 'SU', outputLabel: 'ライセンス-二次創作' },
    
    // その他
    'V': { label: 'V. クレジット表記', group: 'V', outputLabel: 'ライセンス-クレジット' },
    'W': { label: 'W. 権利義務の譲渡等', group: 'W', outputLabel: 'ライセンス-権利譲渡' },
    'X': { label: 'X. 特記事項', group: 'X', outputLabel: 'ライセンス-特記事項' }
};

// デフォルトの短縮表現マッピング
// キー: マッチングする文言（部分一致）, 値: 出力する短縮テキスト
const DEFAULT_MAPPINGS = {
    // 汎用
    'common': [
        { pattern: '権利者に個別に問い合わせて下さい', short: '要問合せ' },
        { pattern: '許可します', short: 'OK' },
        { pattern: '許可しません', short: 'NG' },
        { pattern: '禁止します', short: 'NG' }
    ],
    
    // A-B: 利用主体
    'AB': [
        { pattern: '営利・非営利の目的問わず利用を許可します', short: '営利非営利OK' },
        { pattern: '非営利および非営利有償目的での利用を許可します', short: '非営利有償OK' },
        { pattern: '非営利目的に限り許可します', short: '非営利のみOK' }
    ],

    // C-E: アップロード
    'CE': [
        { pattern: '対象を限定しての公開を許可します', short: '限定許可' }
    ],

    // F-H: センシティブ
    'FH': [
        { pattern: 'ただし棲み分けはおこなうこと', short: '要棲み分け' },
        { pattern: 'ただし私的使用（プライベートな範囲での利用）については禁止しません', short: '私用のみOK' }
    ],
    
    // I-L: 加工
    'IL': [
        { pattern: 'ユーザー間で行うことを許可します', short: 'ユーザー間のみOK' }
    ],

    // M-N: 再配布
    'MN': [
        { pattern: '無償に限り本利用規約に従わせることを条件に許可します', short: '無償・規約遵守条件' },
        { pattern: '無償に限りユーザー間で行うことを許可します', short: '無償・ユーザー間のみ' },
        { pattern: '本利用規約に従わせることを条件に許可します', short: '規約遵守条件' },
        { pattern: '無償に限り許可します', short: '無償のみ' },
        { pattern: 'ユーザー間で行うことを許可します', short: 'ユーザー間のみ' }
    ],
    
    // O-R: メディア・プロダクト利用
    'OR': [
        { pattern: 'オリジナルと異なることが分かる程度に改変した場合は許可します', short: '改変後利用OK(公式誤認対策)' }
    ],

    // S-U: 二次創作
    'SU': [
        { pattern: '営利・非営利の目的問わず配布等（頒布、送信を含む）を許可します', short: '配布OK(営利可)' },
        { pattern: '非営利および非営利有償目的での配布等（頒布、送信を含む）を許可します', short: '配布OK(非営利有償)' },
        { pattern: '非営利目的での配布等（頒布、送信を含む）を許可します', short: '配布OK(非営利のみ)' },
        { pattern: '私的かつ本人のみによる利用に限り許可します', short: '私的利用のみ' },
        { pattern: '作成を許可しません', short: '作成NG' },
        { pattern: '配布等（頒布、送信を含む）を許可しません', short: '配布NG' },
        { pattern: '該当するデータではありません', short: '該当なし' }
    ],

    // V: クレジット表記
    'V': [
        { pattern: '不要ですがあると嬉しいです', short: '不要(歓迎)' },
        { pattern: '必要です', short: '必要' },
        { pattern: '不要です', short: '不要' }
    ],
    
    // W: 権利義務の譲渡等
    'W': []
};

// 初期設定
const DEFAULT_CONFIG = {
    mappings: DEFAULT_MAPPINGS,
    // グループごとの統合設定（trueなら統合して表示）
    groups: {
        'AB': false,
        'CE': false,
        'FH': false,
        'IL': false,
        'MN': false,
        'OR': false,
        'SU': false
    }
};