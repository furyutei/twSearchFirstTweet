twSearchFirstTweet
==================
Twitter上でキーワードを含む最初のツイートを検索するユーザースクリプト

- License: The MIT license  
- Copyright (c) 2014-2020 風柳(furyu)  
- 対象ブラウザ： Google Chrome（[Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)が必要）、Firefox（[Tampermonkey](https://addons.mozilla.org/ja/firefox/addon/tampermonkey/)が必要）


■ twSearchFirstTweet とは？
---
[公式ウェブ版Twitter](https://twitter.com/) 上で、キーワードを含む最初のツイートを検索するユーザースクリプトです。  

- パクツイの元となっているツイートを探したい  
- ハッシュタグ大喜利の一番最初のツイートを探したい  

などの場合に役に立つかも知れません。  


■ インストール方法
---
[Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo?hl=ja)を入れたGoogle Chrome、もしくは、[Tampermonkey](https://addons.mozilla.org/ja/firefox/addon/tampermonkey/)を入れたFirefoxにて、  

> [twSearchFirstTweet.user.js](https://github.com/furyutei/twSearchFirstTweet/raw/master/src/js/twSearchFirstTweet.user.js)  

をクリックし、指示に従ってインストール。  

### 2020/08/19以前にインストールされた方へ
スクリプトのURLが変更になっています（[旧](https://github.com/furyutei/twSearchFirstTweet/raw/master/twSearchFirstTweet.user.js)→[新](https://github.com/furyutei/twSearchFirstTweet/raw/master/src/js/twSearchFirstTweet.user.js)）。  
お手数ですが、旧版を削除した上で、新版をインストールし直してください。  


■ 使い方
---
ウェブ版Twitterの検索画面上部にある検索フォームの右側に、虫眼鏡アイコンが追加されます。  
検索フォーム中にキーワードを入れるた状態でこのアイコンをクリックすると検索を開始し、最初のツイートが見つかった場合には当該のツイートへと遷移します。  


■ 関連記事
---
- [【twSearchFirstTweet】Twitterでキーワードを含む最初のツイートを検索するユーザースクリプトを試作 - 風柳メモ](http://d.hatena.ne.jp/furyu-tei/20141228/1419741796)  
- [Google ChromeへのTampermonkeyのインストールと基本的な使い方 - 風柳メモ](http://d.hatena.ne.jp/furyu-tei/20141227/1419609930)  
