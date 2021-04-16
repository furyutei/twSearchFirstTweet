// ==UserScript==
// @name            Search the first tweet
// @name:ja         最初のツイート検索
// @namespace       https://furyutei.work
// @license         MIT
// @version         0.2.9
// @description     Search the first tweet related to a specific keyword in search timeline of Twitter
// @description:ja  Twitterの検索タイムラインにおいて指定したキーワードに関する最初のツイートを検索
// @author          furyu
// @match           https://twitter.com/*
// @match           https://mobile.twitter.com/*
// @noframes
// @grant           none
// @require         https://greasyfork.org/scripts/410119-twittertimeline/code/TwitterTimeline.js?version=911467
// @compatible      chrome
// @compatible      firefox
// @supportURL      https://github.com/furyutei/twSearchFirstTweet/issues
// @contributionURL https://memo.furyutei.work/about#send_donation
// ==/UserScript==

( async () => {
'use strict';

const
    SCRIPT_NAME = 'twSearchFirstTweet',
    DEBUG = false,
    
    SEARCH_BUTTON_CLASS = SCRIPT_NAME + '-search-button',
    CSS_STYLE_CLASS = SCRIPT_NAME + '-css-rule',
    
    ENABLE_NEW_WINDOW_OPEN = false, // TODO: 検索後に新しいウィンドウを開こうとするとポップアップブロックに引っかかってしまう
    EXCLUDE_RETWEETS = true, // true: リツイートは除外して検索
    TIME_TO_REASSESS_USER_FIRST_TWEET_MSEC = 24 * 60 * 60 * 1000, // ユーザーの最初のツイートを再評価するまでの時間（ミリ秒）
    
    TwitterTimeline = ( ( TwitterTimeline ) => {
        TwitterTimeline.debug_mode = DEBUG;
        TwitterTimeline.logged_script_name = SCRIPT_NAME;
        // デフォルトでは Rate Limit 回避用にディレイが入るので、これを無効化
        TwitterTimeline.TWITTER_API.API_DEFINITIONS[ TwitterTimeline.TIMELINE_TYPE.user ].min_delay_ms = 1;
        TwitterTimeline.TWITTER_API.API_DEFINITIONS[ TwitterTimeline.TIMELINE_TYPE.search ].min_delay_ms = 1;
        return TwitterTimeline;
    } )( window.TwitterTimeline ),
    
    {
        log_debug,
        log,
        log_info,
        log_error,
        TWITTER_API,
        TIMELINE_TYPE,
        REACTION_TYPE,
        CLASS_TIMELINE_SET,
    } = TwitterTimeline,
    
    ClassUserTimeline = CLASS_TIMELINE_SET[ TIMELINE_TYPE.user ],
    ClassSearchTimeline = CLASS_TIMELINE_SET[ TIMELINE_TYPE.search ],
    
    SEARCH_BUTTON_HELP_TEXT = 'Search for the first tweet that contains a given keyword',
    SEARCH_BUTTON_USER_HELP_TEXT = 'Search for the first tweet by this user',
    SEARCHING_HELP_TEXT = 'Searching ...',
    
    search_button_icon_svg = '<svg version="1.1" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg"><g transform="translate(0 -271.6)"><g transform="matrix(1.0127 0 0 .94178 5.2473 -23.213)" aria-label="1" fill="currentColor"><path d="m60.319 382.71h-36.204v-6.2296h14.175v-46.768h-14.175v-5.5074q8.3062-0.0451 11.872-2.3474 3.5663-2.3474 4.0177-7.4034h6.4102v62.026h13.904z"/></g><g fill="currentColor"><path d="m40.125 291.81a32.75 32.75 0 0 0-24.875 31.789 32.75 32.75 0 0 0 32.75 32.75 32.75 32.75 0 0 0 32.75-32.75 32.75 32.75 0 0 0-24.875-31.789v11.859a21 21.5 0 0 1 13.125 19.93 21 21.5 0 0 1-0.9082 6.25h2.9961v8.75h-8.0449a21 21.5 0 0 1-15.043 6.5 21 21.5 0 0 1-15.043-6.5h-8.0449v-8.75h2.9941a21 21.5 0 0 1-0.90625-6.25 21 21.5 0 0 1 13.125-19.932z" style="paint-order:normal"/><rect transform="matrix(.66428 -.74748 .74998 .66146 0 0)" x="-217.91" y="280.73" width="10.664" height="29.006" ry="0" style="paint-order:normal"/></g></g></svg>',
    
    searching_icon_svg = '<svg version="1.1" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" fill="none" r="10" stroke-width="4" style="stroke: currentColor; opacity: 0.4;"></circle><path d="M 12,2 a 10 10 -90 0 1 9,5.6" fill="none" stroke="currentColor" stroke-width="4" />',
    
    get_query_datetime = time_sec => new Date( time_sec * 1000 ).toISOString().replace( /T/, '_' ).replace( /(\.\d*)?Z$/, '_GMT' ),
    
    get_search_input_element = () => document.querySelector( 'div[data-testid="primaryColumn"] form[role="search"] input[data-testid="SearchBox_Search_Input"]' ),
    
    get_screen_name_from_url = ( url ) => new URL( url || location.href ).pathname.split( '/', 2 )[ 1 ],
    
    is_night_mode = () => ( getComputedStyle( document.body ).backgroundColor != 'rgb(255, 255, 255)' ),
    
    save_value = async ( name, value ) => {
        localStorage.setItem( SCRIPT_NAME + '-' + name, value );
    }, // end of save_value()
    
    load_value = async ( name ) => {
        return localStorage.getItem( SCRIPT_NAME + '-' + name );
    }, // end of load_value()
    
    load_user_tweet_info_map = async () => {
        try {
            let user_tweet_info_map_string = await load_value( 'UserTweetInfoMap' );
            
            if ( ! user_tweet_info_map_string ) return {};
            
            let user_tweet_info_map = JSON.parse( user_tweet_info_map_string );
            
            log_debug( 'load_user_tweet_info_map() user_tweet_info_map:', user_tweet_info_map );
            
            return user_tweet_info_map;
        }
        catch ( error ) {
            log_error( 'load_user_tweet_info_map() error:', error );
            return {};
        }
    }, // end of load_user_tweet_info_map()
    
    save_user_tweet_info_map = async ( user_tweet_info_map ) => {
        try {
            let user_tweet_info_map_string = JSON.stringify( user_tweet_info_map );
            
            await save_value( 'UserTweetInfoMap', user_tweet_info_map_string );
        }
        catch ( error ) {
            log_error( 'save_user_tweet_info_map() error:', error );
        }
    }, // end of save_user_tweet_info_map()
    
    user_tweet_info_map = await load_user_tweet_info_map() || {}, // Twitterのユーザーの情報のうち、変化しないユーザーID(id_str)をキーに情報を保存
    
    search_result_map = {},
    
    divide_period = ( period, min_period_length_sec = 180 ) => {
        period = period || {};
        
        if ( ! period.from_time_sec ) period.from_time_sec = new Date( '2006-03-01T00:00:00Z' ).getTime() / 1000;
        if ( ! period.to_time_sec ) period.to_time_sec = Date.now() / 1000;
        
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
    
    search_first_tweet = async ( parameters ) => {
        parameters = parameters || {};
        
        const
            { specified_query, screen_name } = parameters,
            ClassTimeline = screen_name ? ClassUserTimeline : ( specified_query ? ClassSearchTimeline : null );
        
        if ( ! ClassTimeline ) {
            return null;
        }
        
        let user_info = screen_name ? await TWITTER_API.get_user_info( { screen_name } ) : {},
            user_id = screen_name ? user_info.id_str : null;
        
        if ( screen_name && ( ! user_id ) ) {
            return null;
        }
        
        const
            get_valid_tweet_info = async ( SearchTimeline ) => {
                let tweet_info;
                
                while ( true ) {
                    tweet_info = await SearchTimeline.fetch_tweet_info();
                    if ( ! tweet_info ) break;
                    if ( ! EXCLUDE_RETWEETS ) break;
                    if ( tweet_info.reacted_info && ( tweet_info.reacted_info.type == REACTION_TYPE.retweet ) ) {
                        continue; // RTの場合は読み飛ばす
                    }
                    break;
                }
                return tweet_info;
            };
        
        let user_tweet_info = user_id ? ( user_tweet_info_map[ user_id ] || {} ) : {},
            
            period_info = ( () => {
                if ( ! user_id ) {
                    return divide_period();
                }
                
                if ( ! user_tweet_info.first_tweet_url ) {
                    return divide_period( {
                        from_time_sec : new Date( user_info.created_at ).getTime() / 1000,
                    } );
                }
                
                let current_timestamp_ms = Date.now();
                
                try {
                    if ( ( ! user_tweet_info.reassess_timstamp_ms ) || ( user_tweet_info.reassess_timstamp_ms < current_timestamp_ms ) ) {
                        // 一定期間経過後は、ツイートを再チェック
                        user_tweet_info.reassess_timstamp_ms = null;
                        
                        return {
                            first_period : {
                                from_time_sec : Math.floor( new Date( user_info.created_at ).getTime() / 1000 ),
                                to_time_sec : user_tweet_info.period.to_time_sec,
                            },
                            second_period : {
                                from_time_sec : user_tweet_info.period.to_time_sec,
                                to_time_sec : Math.floor( current_timestamp_ms / 1000 ),
                           }
                        };
                    }
                    else {
                        // キャッシュ時間内は保存された period を使用
                        return {
                            first_period : user_tweet_info.period,
                            second_period : {
                                from_time_sec : user_tweet_info.period.to_time_sec,
                                to_time_sec : Math.floor( current_timestamp_ms / 1000 ),
                           }
                        };
                   }
                }
                catch ( error ) {
                    log_error( 'Illegal format in user_tweet_info:', user_tweet_info, error );
                    
                    return divide_period( {
                        from_time_sec : new Date( user_info.created_at ).getTime() / 1000,
                    } );
                }
            } )(),
            next_period_info,
            try_counter = 0,
            hit_tweet_info = null,
            hit_period = null,
            HitSearchTimeline,
            query_base = specified_query;
        
        while ( period_info ) {
            try_counter ++;
            
            let period_length = period_info.first_period.to_time_sec - period_info.first_period.from_time_sec;
            
            log_debug(
                'try_counter:', try_counter,
                'period length(sec):', period_length,
                'period_info:', period_info,
                'until:', new Date( period_info.first_period.to_time_sec * 1000 ).toISOString()
            );
            
            let SearchTimeline = new ClassTimeline( {
                    screen_name,
                    specified_query,
                    max_timestamp_ms : period_info.first_period.to_time_sec * 1000 + 1,
                    keep_since : true,
                } );
            
            query_base = SearchTimeline.query_base;
            
            if ( ! query_base ) return null;
            
            let tweet_info = await get_valid_tweet_info( SearchTimeline );
            
            log_debug( ( tweet_info || {} ).datetime, tweet_info );
            
            if ( tweet_info ) {
                hit_tweet_info = tweet_info;
                hit_period = period_info.first_period;
                HitSearchTimeline = SearchTimeline;
                next_period_info = divide_period( period_info.first_period );
                
                log_debug( '[in this period]', period_info.first_period, 'period_length:', period_length, '(sec) => found ! tweet_info:', tweet_info, 'next_period_info:', next_period_info, 'SearchTimeline:', SearchTimeline );
            }
            else {
                next_period_info = divide_period( period_info.second_period );
                
                log_debug( '[in this period]', period_info.first_period, 'period_length:', period_length, '(sec) => no tweet ... next_period_info:', next_period_info, 'SearchTimeline:', SearchTimeline );
            }
            
            if ( ! next_period_info ) {
                if ( HitSearchTimeline ) {
                    SearchTimeline = HitSearchTimeline;
                }
                else {
                    hit_period = period_info.second_period;
                    SearchTimeline = new ClassTimeline( {
                        screen_name,
                        specified_query,
                        max_timestamp_ms : hit_period.to_time_sec * 1000 + 1,
                        keep_since : true,
                    } );
                }
                
                while ( true ) {
                    tweet_info = await get_valid_tweet_info( SearchTimeline );
                    
                    if ( ! tweet_info ) break;
                    
                    hit_tweet_info = tweet_info;
                }
                
                if ( hit_tweet_info ) {
                    hit_period.from_time_sec = Math.floor( hit_tweet_info.timestamp_ms / 1000 );
                }
                else {
                    hit_period = null;
                }
                break;
            }
            period_info = next_period_info;
        }
        
        let result = {
                first_tweet_info : hit_tweet_info,
                period : hit_period,
                screen_name,
                user_id,
                specified_query,
                query_base,
            };
        
        if ( user_id ) {
            user_tweet_info_map[ user_id ] = {
                user_id,
                screen_name,
                first_tweet_url : ( hit_tweet_info || {} ).tweet_url,
                first_tweet_timestamp_ms : ( hit_tweet_info || {} ).timestamp_ms,
                period : hit_period,
                reassess_timstamp_ms : user_tweet_info.reassess_timstamp_ms || ( Date.now() + TIME_TO_REASSESS_USER_FIRST_TWEET_MSEC ),
            }
            await save_user_tweet_info_map( user_tweet_info_map );
            
            log_debug( 'updated user_tweet_info_map:', user_tweet_info_map );
        }
        log_debug( 'result:', result );
        
        return result;
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
            
            let br = search_button.parentNode.querySelector( '.before-linefeed' ),
                previous_element = search_button.previousSibling;
            
            if ( ( ! br ) || ( ! previous_element ) ) return;
            if ( previous_element.previousSibling && previous_element.previousSibling.classList.contains( 'before-linefeed' ) ) return;
            
            log_debug( 're-insert br.before-linefeed' );
            previous_element.before( br );
            return;
        }
        
        const
            search_form = ( () => {
                const
                    search_input = get_search_input_element();
                if ( ! search_input ) return null;
                return search_input.closest( 'form[role="search"]' );
            } )(),
            
            user_profile_header_items_container = document.querySelector( 'div[data-testid="primaryColumn"] [data-testid="UserProfileHeader_Items"]' ),
            
            base_container = search_form || ( user_profile_header_items_container || {} ).lastChild;
        
        if ( ! base_container ) return;
        
        search_button = document.createElement( 'div' );
        search_button.classList.add( SEARCH_BUTTON_CLASS );
        
        if ( search_form ) {
            search_button.classList.add( 'search-timeline' );
            search_button.title = SEARCH_BUTTON_HELP_TEXT;
        }
        else {
            search_button.classList.add( 'user-timeline' );
            search_button.title = SEARCH_BUTTON_USER_HELP_TEXT;
        }
        
        if ( is_night_mode() ) {
            search_button.classList.add( 'night-mode' );
        }
        
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
            
            let screen_name = search_form ? null : get_screen_name_from_url(),
                specified_query = search_form ? ( ( get_search_input_element() || {} ).value || ( Array.from( new URL( location.href ).searchParams ).filter( p => p[ 0 ] == 'q' )[ 0 ] || [] )[ 1 ] || '' ) : 'from:' + screen_name;
            
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
            
            let result = await search_first_tweet( { specified_query, screen_name } ) || {};
            log_debug( 'search_first_tweet() result:', result );
            
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
        
        base_container.after( search_button );
        
        if ( user_profile_header_items_container ) {
            // 「xxxx年xx月からTwitterを利用しています」の前に改行を挿入
            let br = document.createElement( 'br' );
            br.classList.add( 'before-linefeed' );
            ( search_button.previousSibling || search_button ).before( br );
        }
    }, // end of check_page_transition()
    
    insert_css_rule = () => {
        const
            button_selector = '.' + SEARCH_BUTTON_CLASS,
            css_rule_text = `
                ${button_selector} {
                    display: inline-block;
                    width: 28px;
                    height: 28px;
                    background: transparent;
                    color: #8899a6;
                    cursor: pointer;
                }
                
                ${button_selector}.search-timeline {
                    position: absolute;
                    bottom: 2px;
                    right: -28px;
                }
                
                ${button_selector}.user-timeline {
                    position: relative;
                    top: 8px;
                    left: 8px;
                }
                
                ${button_selector}:hover {
                    color: #17bf63;
                }
                
                ${button_selector}.searching svg {
                    animation: searching 1.5s linear infinite;
                }
                
                @keyframes searching {
                    0% {transform: rotate(0deg);}
                    100% {transform: rotate(360deg);}
                }
                
                ${button_selector}.night-mode {
                }
                
                br.before-linefeed:first-child {
                    display: none;
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
