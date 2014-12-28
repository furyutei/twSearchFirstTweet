// ==UserScript==
// @name            twSearchFirstTweet
// @namespace       http://d.hatena.ne.jp/furyu-tei
// @author          furyu
// @version         0.1.0.4
// @include         http://twitter.com/*
// @include         https://twitter.com/*
// @description     search the first tweet on Twitter
// ==/UserScript==
/*
The MIT License (MIT)
Copyright (c) 2014 furyu <furyutei@gmail.com>
*/

(function(w, d){

var main = function(w, d){
    var DEBUG = false;
    var TERMINATE_SEARCH_THRESHOLD = 1;
    
    var log = function(object) {
        if (!DEBUG) return;
        console.error('['+new Date().toISOString()+']', object);
    };
    
    var NAME_SCRIPT = 'twSearchFirstTweet';
    var $=w.$;
    if (w[NAME_SCRIPT+'_touched']) return;
    if (!$) {
        var main = arguments.callee; setTimeout(function(){main(w,d);}, 100); return;
    }
    log('*** '+  NAME_SCRIPT +' start');
    w[NAME_SCRIPT+'_touched'] = true;
    
    var get_date_from_ms = function(ms) {
        var date = new Date();
        date.setTime(ms);
        return date;
    };  //  end of get_date_from_ms()
    
    var round_date_string = function(date) {
        if (!(date instanceof Date)) date = new Date(date);
        return date.toISOString().replace(/\..*$/,'.000Z');
    };  //  end of round_date_string()
    
    var round_date = function(date) {
        return new Date(round_date_string(date));
    };
    
    var date_shift = function(date, seconds) {
        date = round_date(date);
        date.setSeconds(date.getSeconds()+seconds);
        return date;
    };  //  end of date_shift()
    
    var divide_period = function(since, until) {
        var first_since = since = round_date(since);
        var second_until = until = round_date(until);
        first_until = get_date_from_ms((first_since.getTime()+second_until.getTime())/2);
        second_since = first_until = round_date(first_until);
        return {
            first_half: {
                since: first_since
            ,   until: first_until
            }
        ,   second_half: {
                since: second_since
            ,   until: second_until
            }
        };
    };  //  end of divide_period()
    
    var get_query_date_string = function(date) {
        if (!(date instanceof Date)) date = new Date(date);
        return date.toISOString().replace(/T([^.]+)\..*$/, '_$1_UTC');
    };  //  end of get_date_string_for_search()
    
    var get_search_url = function(search_words, since, until) {
        search_words = (' '+search_words+' ').replace(/\s(?:since|until):[^\s]+/g, ' ').replace(/(^\s+|\s+$)/g, '');
        var query = search_words;
        if (since) query += ' since:' + get_query_date_string(since);
        if (until) query += ' until:' + get_query_date_string(until);
        log('q=' + query);
        var url = 'https://twitter.com/search?f=realtime&q=' + encodeURIComponent(query);
        return url;
    };  //  end of get_search_url()
    
    var do_search = function(search_words, target_period, callback) {
        var search_url = get_search_url(search_words, target_period.since, target_period.until);
        target_period.search_url = search_url;
        $.get(search_url, callback, 'html');
        return search_url;
    };  //  end of do_search()
    
    var get_tweets = function(html) {
        var links = html.match(/<a[^>]+class="[^"]*tweet-timestamp[\s\S]*?<\/a>/g);
        if (!links) links = [];
        var tweets = [];
        for (var ci=0, len=links.length; ci < len; ci++) {
            var link = links[ci];
            tweets[tweets.length] = {
                path: (link.match(/href="([^"]*)"/)) ? RegExp.$1 : ''
            ,   title: (link.match(/title="([^"]*)"/)) ? RegExp.$1 : ''
            ,   data_time: (link.match(/data-time="([^"]*)"/)) ? RegExp.$1 : ''
            ,   data_time_ms: (link.match(/data-time-ms="([^"]*)"/)) ? RegExp.$1 : ''
            };
        }
        log(tweets);
        return tweets;
    };  //  end of get_tweets()
    
    var search_first_tweet = function(search_words, finish, debug) {
        if (debug) DEBUG = true;
        var since = new Date('2006-03-01T00:00:00.000Z'), until = date_shift(new Date(), 1);
        //var period_info = divide_period(since, until), target_period = period_info.first_half;
        var period_info = null, target_period = {since: since, until: until};
        
        var counter = 0;
        var callback = function(html) {
            counter++;
            log('*** callback(): count=' + counter);
            var tweets = get_tweets(html);
            if (tweets.length <= 0) {
                if (!period_info || target_period !== period_info.first_half) {
                    finish({since: null, until: null, search_url: get_search_url(search_words)}, []);
                    return;
                }
                target_period = period_info.second_half;
            }
            else if (TERMINATE_SEARCH_THRESHOLD < tweets.length) {
                period_info = divide_period(target_period.since, target_period.until);
                if (period_info.first_half.until.getTime() <= period_info.first_half.since.getTime()) {
                    finish(target_period, tweets);
                    return;
                }
                target_period = period_info.first_half;
            }
            else {
                //finish(target_period, tweets);
                var since = get_date_from_ms(tweets[tweets.length-1].data_time_ms), until = date_shift(since, 1);
                finish({since: since, until: until, search_url: get_search_url(search_words, since, until)}, [tweets[tweets.length-1]]);
                return;
            }
            do_search(search_words, target_period, callback);
        };
        do_search(search_words, target_period, callback);
        
    };  //  end of search_first_tweet()
    
    var add_search_button = function(){
        var jq_search_button = $('<li id="'+ NAME_SCRIPT + '_button"><a class="js-nav js-tooltip" href="#" data-placement="bottom" title="search for first tweet based on keywords" style="color:navy;"><span class="Icon Icon--search Icon--large"></span><span class="text"></span></a></li>');
        var jq_link = jq_search_button.find('a');
        jq_link.click(function(){
            var search_words = String(d.getSelection()) || $('input#search-query').val();
            if (!search_words) return false;
            
            var cwin = w.open('about:blank'), cdoc = cwin.document;
            var html = '<html><head><title>' + NAME_SCRIPT + ': #TITLE#</title></head><body><h1 style="font-size:12px; color:darkgreen;">' + NAME_SCRIPT + '</h1><h2 style="font-size:16px;">#HEADER#</h2>#BODY#</body></html>';
            cdoc.open();
            cdoc.write(html.replace(/#TITLE#/g, 'Searching ...').replace(/#HEADER#/g, 'Searching ...').replace(/#BODY#/g, '<p><img src="//furyu-tei.sakura.ne.jp/icon/loading_icon.gif" alt="searching..." title="searching..." /></p>'));
            cdoc.close();
            search_first_tweet(search_words, function(info, tweets){
                if (0 < tweets.length) {
                    var tweet_htmls = [];
                    for (var ci=tweets.length-1; 0 <= ci; ci--) {
                        var tweet = tweets[ci];
                        tweet_htmls[tweet_htmls.length] = '<blockquote class="twitter-tweet" lang="ja"><a href="https://twitter.com' + tweet.path + '">' + tweet.title + '</a></blockquote>';
                    }
                    var tweet_html = tweet_htmls.join('') + '<script async src="//platform.twitter.com/widgets.js" charset="utf-8"></script>';
                }
                else {
                    var tweet_html = '<p>Not found</p>';
                }
                cdoc.open();
                //var search_url = info.search_url;
                var search_url = get_search_url(search_words, null, info.until);
                cdoc.write(html.replace(/#TITLE#/g, 'Result').replace(/#HEADER#/g, '<a href="' + search_url + '" style="text-decoration:none;">Search Result</a>').replace(/#BODY#/g, tweet_html));
                cdoc.close();
            });
            return false;
        });
        $('div.global-nav ul.nav.right-actions').prepend(jq_search_button);
    };  //  end of add_search_button()
    
    add_search_button();
    
}   //  end of main()


if (typeof w.$ == 'function') {
    main(w, d);
}
else {
    var container = d.documentElement;
    var script = d.createElement('script');
    script.textContent = '('+main.toString()+')(window, document);';
    container.appendChild(script);
}

})(window, document);

// ■ end of file
