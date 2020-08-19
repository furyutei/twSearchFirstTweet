// ==UserScript==
// @name            Search the first tweet
// @name:ja         最初のツイート検索
// @namespace       https://furyutei.work
// @license         MIT
// @version         0.2.0
// @description     Search the first tweet related to a specific keyword in search timeline of Twitter
// @description:ja  Twitterの検索タイムラインにおいて指定したキーワードに関する最初のツイートを検索
// @author          furyu
// @match           https://twitter.com/*
// @match           https://mobile.twitter.com/*
// @grant           none
// @require         http://furyutei.github.io/twSearchFirstTweet/src/js/timeline.js
// @compatible      chrome
// @compatible      firefox
// @supportURL      https://github.com/furyutei/twSearchFirstTweet/issues
// @contributionURL https://memo.furyutei.work/about#%E6%B0%97%E3%81%AB%E5%85%A5%E3%81%A3%E3%81%9F%E5%BD%B9%E3%81%AB%E7%AB%8B%E3%81%A3%E3%81%9F%E3%81%AE%E3%81%8A%E6%B0%97%E6%8C%81%E3%81%A1%E3%81%AF%E3%82%AE%E3%83%95%E3%83%88%E5%88%B8%E3%81%A7
// ==/UserScript==

( async () => {
'use strict';

const
    SCRIPT_NAME = 'twSearchFirstTweet',
    DEBUG = false,
    
    SEARCH_BUTTON_CLASS = SCRIPT_NAME + '-search-button',
    CSS_STYLE_CLASS = SCRIPT_NAME + '-css-rule',
    
    ENABLE_NEW_WINDOW_OPEN = false, // TODO: 検索後に新しいウィンドウを開こうとするとポップアップブロックに引っかかってしまう
    
    TwitterTimeline = ( ( TwitterTimeline ) => {
        TwitterTimeline.debug_mode = DEBUG;
        TwitterTimeline.logged_script_name = SCRIPT_NAME;
        TwitterTimeline.TWITTER_API.API_DEFINITIONS[ TwitterTimeline.TIMELINE_TYPE.search ].min_delay_ms = 1; // デフォルトではディレイが入るのでこれを無効化
        return TwitterTimeline;
    } )( window.TwitterTimeline ),
    
    {
        log_debug,
        log,
        log_info,
        log_error,
        TWITTER_API,
        TIMELINE_TYPE,
        CLASS_TIMELINE_SET,
    } = TwitterTimeline,
    
    ClassSearchTimeline = CLASS_TIMELINE_SET[ TIMELINE_TYPE.search ],
    
    SEARCH_BUTTON_HELP_TEXT = 'Search for the first tweet that contains a given keyword',
    SEARCHING_HELP_TEXT = 'Searching ...',
    
    search_button_icon_svg = '<svg version="1.1" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg"><g transform="translate(0 -271.6)"><g transform="matrix(1.0127 0 0 .94178 5.2473 -23.213)" aria-label="1" fill="currentColor"><path d="m60.319 382.71h-36.204v-6.2296h14.175v-46.768h-14.175v-5.5074q8.3062-0.0451 11.872-2.3474 3.5663-2.3474 4.0177-7.4034h6.4102v62.026h13.904z"/></g><g fill="currentColor"><path d="m40.125 291.81a32.75 32.75 0 0 0-24.875 31.789 32.75 32.75 0 0 0 32.75 32.75 32.75 32.75 0 0 0 32.75-32.75 32.75 32.75 0 0 0-24.875-31.789v11.859a21 21.5 0 0 1 13.125 19.93 21 21.5 0 0 1-0.9082 6.25h2.9961v8.75h-8.0449a21 21.5 0 0 1-15.043 6.5 21 21.5 0 0 1-15.043-6.5h-8.0449v-8.75h2.9941a21 21.5 0 0 1-0.90625-6.25 21 21.5 0 0 1 13.125-19.932z" style="paint-order:normal"/><rect transform="matrix(.66428 -.74748 .74998 .66146 0 0)" x="-217.91" y="280.73" width="10.664" height="29.006" ry="0" style="paint-order:normal"/></g></g></svg>',
    
    searching_icon_svg = '<svg version="1.1" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" fill="none" r="10" stroke-width="4" style="stroke: currentColor; opacity: 0.4;"></circle><path d="M 12,2 a 10 10 -90 0 1 9,5.6" fill="none" stroke="currentColor" stroke-width="4" />',
    
    get_query_datetime = time_sec => new Date( time_sec * 1000 ).toISOString().replace( /T/, '_' ).replace( /(\.\d*)?Z$/, '_GMT' ),
    
    get_search_input_element = () => document.querySelector( 'div[data-testid="primaryColumn"] form[role="search"] input[data-testid="SearchBox_Search_Input"]' ),
    is_night_mode = () => ( getComputedStyle( document.body ).backgroundColor != 'rgb(255, 255, 255)' ),
    
    divide_period = ( period, min_period_length_sec = 180 ) => {
        if ( ! period ) {
            period = {
                from_time_sec : new Date( '2006-03-01T00:00:00Z' ).getTime() / 1000,
                to_time_sec : Date.now() / 1000,
            };
        }
        
        let from_time_sec = Math.floor( period.from_time_sec ),
            to_time_sec = Math.floor( period.to_time_sec );
        
        if ( to_time_sec - min_period_length_sec <= from_time_sec ) {
            return null;
        }
        
        let middle_time_sec = Math.floor( from_time_sec + ( to_time_sec - from_time_sec ) / 2 );
        
        if ( ( middle_time_sec <= from_time_sec ) || ( to_time_sec <= middle_time_sec ) ) {
            return null;
        }
        
        return {
            first_period : {
                from_time_sec : from_time_sec,
                to_time_sec : middle_time_sec,
            },
            second_period : {
                from_time_sec : middle_time_sec,
                to_time_sec : to_time_sec,
            },
        }
    }, // end of divide_period()
    
    search_result_map = {},
    
    search_first_tweet = async ( specified_query ) => {
        let period_info = divide_period(),
            next_period_info,
            try_counter = 0,
            hit_tweet_info = null,
            hit_period = null,
            HitSearchTimeline,
            query_base = specified_query;
        
        while ( period_info ) {
            try_counter ++;
            
            log_debug(
                'try_counter:', try_counter,
                'period length(sec):', ( period_info.second_period.to_time_sec - period_info.first_period.from_time_sec ),
                'period_info:', period_info,
                'until:', new Date( period_info.first_period.to_time_sec * 1000 ).toISOString()
            );
            
            let SearchTimeline = new ClassSearchTimeline( {
                    specified_query : specified_query,
                    max_timestamp_ms : period_info.first_period.to_time_sec * 1000 + 1,
                } ),
                tweet_info = await SearchTimeline.fetch_tweet_info();
            
            query_base = SearchTimeline.query_base;
            
            if ( ! query_base ) return null;
            
            log_debug( ( tweet_info || {} ).datetime, tweet_info );
            
            if ( tweet_info ) {
                hit_tweet_info = tweet_info;
                hit_period = period_info.first_period;
                HitSearchTimeline = SearchTimeline;
                next_period_info = divide_period( period_info.first_period );
            }
            else {
                next_period_info = divide_period( period_info.second_period );
            }
            
            if ( ! next_period_info ) {
                if ( HitSearchTimeline ) {
                    SearchTimeline = HitSearchTimeline;
                }
                else {
                    SearchTimeline = new ClassSearchTimeline( {
                        specified_query : specified_query,
                        max_timestamp_ms : period_info.second_period.to_time_sec * 1000 + 1,
                    } );
                }
                
                while ( true ) {
                    tweet_info = await SearchTimeline.fetch_tweet_info();
                    if ( ! tweet_info ) break;
                    
                    hit_tweet_info = tweet_info;
                }
                break;
            }
            period_info = next_period_info;
        }
        
        log_debug( hit_period, hit_tweet_info );
        
        return {
            first_tweet_info : hit_tweet_info,
            period : hit_period,
            specified_query,
            query_base,
        };
    },  // end of search_first_tweet()
    
    check_page_transition = () => {
        let search_button = document.querySelector( '.' + SEARCH_BUTTON_CLASS );
        
        if ( search_button ) {
            if ( is_night_mode() ) {
                search_button.classList.add( 'night-mode' );
            }
            else {
                search_button.classList.remove( 'night-mode' );
            }
            return;
        }
        
        const
            search_input = get_search_input_element();
        
        if ( ! search_input ) return;
        
        const
            search_form = search_input.closest( 'form[role="search"]' );
        
        if ( ! search_form ) return;
        
        search_button = document.createElement( 'div' );
        search_button.classList.add( SEARCH_BUTTON_CLASS );
        if ( is_night_mode() ) {
            search_button.classList.add( 'night-mode' );
        }
        search_button.title = SEARCH_BUTTON_HELP_TEXT;
        
        let search_button_icon,
            searching_icon;
        
        search_button.insertAdjacentHTML( 'beforeend', searching_icon_svg );
        searching_icon = search_button.firstChild;
        searching_icon.remove();
        search_button.insertAdjacentHTML( 'beforeend', search_button_icon_svg );
        search_button_icon = search_button.firstChild;
        
        const
            do_page_transition = ( url ) => {
                if ( ! url ) return;
                
                if ( ENABLE_NEW_WINDOW_OPEN ) {
                    window.open( url );
                }
                else {
                    //location.href = url;
                    // TODO: ページ読み込みを発生させないために pushState を使用しているが、Twitter側で state の構造（特に key）が変わってしまうとうまく動かなくなる
                    // TODO: Firefox79.0 (64 ビット)＋Violentmonkey 2.12.7の場合、Twitter側のスクリプト（main*.js）にてエラーが発生する（Uncaught Error: Permission denied to access property "key"）
                    // →とりあえず、Tampermonkey 4.11.6117 なら動作する模様
                    let state = {
                            key : 'r80bpk',
                            state : {
                                fromApp : true,
                                previousPath : location.pathname,
                            },
                        },
                        pop_state_event = new PopStateEvent( 'popstate', { state : state } );
                    
                    history.pushState( state, '', new URL( url ).pathname );
                    dispatchEvent( pop_state_event );
                }
            };
        
        let is_searching = false;
        
        search_button.addEventListener( 'click', async ( event ) => {
            event.preventDefault();
            event.stopPropagation();
            
            if ( is_searching ) return;
            
            let specified_query = ( get_search_input_element() || {} ).value || ( Array.from( new URL( location.href ).searchParams ).filter( p => p[ 0 ] == 'q' )[ 0 ] || [] )[ 1 ] || '';
            
            if ( ! specified_query ) {
                return;
            }
            
            if ( search_result_map[ specified_query ] ) {
                do_page_transition( ( search_result_map[ specified_query ].first_tweet_info || {} ).tweet_url );
                return;
            }
            
            is_searching = true;
            search_button_icon.remove();
            search_button.appendChild( searching_icon );
            search_button.classList.add( 'searching' );
            search_button.title = SEARCHING_HELP_TEXT;
            
            let result = await search_first_tweet( specified_query ) || {};
            
            search_result_map[ specified_query ] = result;
            
            if ( result && result.first_tweet_info ) {
                do_page_transition( ( result.first_tweet_info || {} ).tweet_url );
            }
            
            is_searching = false;
            searching_icon.remove();
            search_button.appendChild( search_button_icon );
            search_button.classList.remove( 'searching' );
            search_button.title = SEARCH_BUTTON_HELP_TEXT;
        } );
        search_form.after( search_button );
    }, // end of check_page_transition()
    
    insert_css_rule = () => {
        const
            button_selector = '.' + SEARCH_BUTTON_CLASS,
            css_rule_text = `
                ${button_selector} {
                    position: absolute;
                    right: -28px;
                    bottom: 2px;
                    display: inline-block;
                    width: 28px;
                    height: 28px;
                    background: transparent;
                    color: #8899a6;
                    cursor: pointer;
                }
                
                ${button_selector}:hover {
                    color: #17bf63;
                }
                
                ${button_selector}.night-mode {
                }
                
                ${button_selector}.searching svg {
                    animation: searching 1.5s linear infinite;
                }
                
                @keyframes searching {
                    0% {transform: rotate(0deg);}
                    100% {transform: rotate(360deg);}
                }
            `;
        
        let css_style = document.querySelector( '.' + CSS_STYLE_CLASS );
        
        if ( css_style ) css_style.remove();
        
        css_style = document.createElement( 'style' );
        css_style.classList.add( CSS_STYLE_CLASS );
        css_style.textContent = css_rule_text;
        
        document.querySelector( 'head' ).appendChild( css_style );
    }, // end of insert_css_rule()
    
    observer = new MutationObserver( ( records ) => {
        try {
            stop_observe();
            check_page_transition();
        }
        finally {
            start_observe();
        }
    } ),
    start_observe = () => observer.observe( document.body, { childList : true, subtree : true } ),
    stop_observe = () => observer.disconnect();

insert_css_rule();
start_observe();

} )();
