var DEBUG = false;
var DEBUG_SHOW_TWEETS = false;
var Services = [
  {
  	name: "twitpic",
  	domain: "twitpic.com",
  	sample: "http://twitpic.com/123456", 
  	transform: function(url) {
  	  return url.replace("twitpic.com/", "twitpic.com/show/large/");
  	}
  },
  {  
    name: "instagram", 
    domain: "instagr.am",
    sample: "http://instagr.am/p/CIW2h/", 
    transform: function(url) {
      return url+'media?size=m';
    }
  },
  {   
    name: "yfrog",
    domain: "yfrog.com",
    sample: "http://yfrog.com/12345678", 
    transform: function(url) {
      return url+':medium';
    }
  },
  {
    name: "flickr",
    domain: "flic.kr",
    sample: "http://flic.kr/p/2U89G8",
    transform: function(url) {
      n = url.lastIndexOf('/');
      thumb_url = url.substring(0, n) + "/img" + url.substring(n) + "_m.jpg";
      return thumb_url;
    }
  },
  {
    name: "twimg",
    domain: "p.twimg.com",
    sample: "http://p.twimg.com/AhedgGpCEAA7cB5.jpg",
    transform: function(url) {
      return url+':small';
    }
  },
  {
    name: "twitgoo",
    domain: "twitgoo.com",
    sample: "http://twitgoo.com/54wpxt",
    transform: function(url) {
      return url+'/img';
    }
  },
  {
    name: "imgur",
    domain: "i.imgur.com",
    sample: "http://i.imgur.com/dSKyb.jpg",
    transform: function(url) {
      return url.replace(".jpg", "m.jpg");
    }
  }
];

var $GROUNDSTREAM_CANVAS = null;
var $GROUNDSTREAM_SEARCHBOX = null;

// Called to start everything up.
function groundstream() {
  $GROUNDSTREAM_CANVAS = $('#crunch');
  $GROUNDSTREAM_SEARCHBOX = $('#woof');
  
  var searchPlace;
  var run_timeout; // instant search: save the httprequest so we can kill it
  
  // get lat/lon from place name
  if(window.location.hash) {
    $GROUNDSTREAM_SEARCHBOX.val(window.location.hash.replace('#', ''));

    searchPlace = $GROUNDSTREAM_SEARCHBOX.val();
  
    groundstream_run(searchPlace);
  }
  
  $GROUNDSTREAM_SEARCHBOX.keyup(function(event) {
    clearTimeout(run_timeout);
    searchPlace = $GROUNDSTREAM_SEARCHBOX.val();

    // when a key is struck, clear the future RUN call
    if(run_timeout) {
      if(DEBUG) console.log('abort!'); 
      run_timeout.abort;
    }
    
    if(event.keyCode == 13) {
      // return key
      if(run_timeout) {
        run_timeout.abort;
      }
      groundstream_run(searchPlace);
    } else if(event.keyCode >= 65 && event.keyCode <= 90)  {
      run_timeout = setTimeout(function(){ groundstream_run(searchPlace) }, 500);
    }
  });
}

// can't bind or live the error method, unfortunately. bug in safari, firefox, etc
// http://forum.jquery.com/topic/error-event-with-live
// have to hack it in: <img onerror="javascript:groundstream_image_load_error(this)" ...
function groundstream_image_load_error() {
	// if we're in prod, hide all broken images
  if(!DEBUG) $(this).parent().parent().css('display', 'none');
}

function stopLoading() {
  if(window.stop !== undefined) {
    window.stop();
  } else if(document.execCommand !== undefined) {
    document.execCommand("Stop", false);
  }
}

var runcount = 0;

function groundstream_run(searchPlace) {
  if(DEBUG) console.log('run '+runcount++);
  groundstream_ui_show();
  groundstream_ui_analytics(searchPlace);

  $GROUNDSTREAM_SEARCHBOX.val(searchPlace);
  if(DEBUG) console.log(searchPlace);
  groundstream_reset_canvas();
  
  // If there's a hashtag, search by keyword.
  // First hashtag is stripped before entering this function,
  // so it'll need two hashtags from a URL (eg ##boise).
  if (searchPlace.indexOf("#") != -1) {
    search_hashtag(searchPlace);
  } else {
    window.location.hash = searchPlace;
    var geocoder = new google.maps.Geocoder();
    if(geocoder) {
      geocoder.geocode({ 'address': searchPlace }, function (results, status) {
        if (status == google.maps.GeocoderStatus.OK) {
          var lat = results[0].geometry.location.lat();
          var lon = results[0].geometry.location.lng();

          if(DEBUG) console.log('searching around '+lat+','+lon);
          search_location(lat+','+lon);
        } else {
          if(DEBUG) console.log("Geocoding failed: " + status);
        }
      });
    }
  }
}

function search_hashtag(tagWithHashtag) {
  search(tagWithHashtag, null);
}

function search_location(latlon) {
  var accuracy = '100';
  var place = latlon+','+accuracy+'mi';
  search(null, place);
}

function search(hashtag, location) {
  // construct a query string that includes each image service
	var query_services = new Array();
	for(var j=0; j<Services.length; j++) {
		query_services.push(Services[j]['name']);
	}
	var query_string = query_services.join(' OR ');
	
  if (DEBUG) console.log("hashtag: " + hashtag);
  if (DEBUG) console.log("location: " + location);
	
  hashtag = hashtag !== null ? ' ' + hashtag.replace('#', '%23') : "";
  location = location !== null ? "&geocode=" + location : "";
  
  query_string = query_string + hashtag;
    
  var query = "http://search.twitter.com/search.json?q="+query_string+""+location+"&rpp=100&include_entities=true";

  if(DEBUG) console.log(query);

  if(DEBUG) console.log('waiting for response...');
  var fetch = $.ajax({
    type:'GET',
    url:query,
    data:"callback=?",
    success:function(feed) {
      if(DEBUG) console.log('parsing...');
      $('#crunch').html('');
      
      var tweets = [];
      for(var i=0; i<feed.results.length; i++) {
        tweets.push(feed.results[i]);
      }
      
      groundstream_render(tweets);   
    },
    dataType:'jsonp'
  });
}


function groundstream_render(tweets) {
  var seen = []; // keep a list of urls we've seen so we don't repeat
  var tweet;
  var service;

  // loop all tweets
  // don't change this to a foreach, it's done like this on purpose
  for(var i=0; i<tweets.length; i++) {
    tweet = tweets[i];
    
    if(DEBUG && DEBUG_SHOW_TWEETS) console.log(tweet);

    // loop each service
    // don't change this to a foreach, it's done like this on purpose
    for(var j=0; j<Services.length; j++) {
      service = Services[j];
      var url, location, size, img;

      if(typeof tweet.entities.urls == 'undefined'
        || tweet.entities.urls.length == 0) {
        // someone just said "twitpic" or somesuch, no actual url
        break;
      }

      // TODO: only works with the first url in the tweet. should work with all urls (more than one twitpic)
      if(typeof tweet.entities.urls[0].expanded_url != 'undefined') {
        url = tweet.entities.urls[0].expanded_url;
      } else {
        url = tweet.entities.urls[0].url;
      }

      // save the url in the tweet for easyness later
      tweet.gs_url = url;
      
      // sanity check
      if(url.indexOf(service['domain']) <= 0) {
        continue;
      }

      img = service['transform'](url);
      tweet.gs_thumbnail = img;

      // save the service name for easyness later
      tweet.gs_service = service['name'];

      // be sure we haven't seen this one before
      // (filters out RTs)
      if($.inArray(img, seen) < 0) {
        seen.push(img);

        var now = new Date();
        var then = new Date(tweet.created_at);
        var diff = .001 * (now.getTime() - then.getTime());

        if(diff < 60)
          diff = Math.round(diff) + ' seconds';
        else if(diff < 120)
          diff = '1 minute';
        else if(diff < 60*60)
          diff = Math.round(diff/60) + ' minutes';
        else if(diff < 60*60*24)
          diff = Math.round((diff/60)/24) + ' hours';
        else
          diff = Math.round(((diff/60)/24)/7) + ' days';

        tweet.gs_time = diff;

        $('#crunch').append(groundstream_render_tweet(tweet));
      }
      // found the right service. done with this tweet.
      break;
    }
  }

  groundstream_done();
}

// Gets the first URL written in a tweet
function groundstream_parseURL(tweet, service) {
	if(tweet.text.indexOf(service['domain']) == 0) {
		return false;
	}
	var location = tweet.text.indexOf("http:");
  var size = service['sample'].length;
  return tweet.text.substring(location, location+size);
}

// UI to render a tweet
function groundstream_render_tweet(tweet) {
  // main tweet div
  var $render = $(document.createElement('div')).addClass('img');
  
  // image
  var $img = $(document.createElement('img'))
  $img.attr('src', tweet.gs_thumbnail);
  $img.error(groundstream_image_load_error);
    
  // add the tweet to the bottom
  // |-avatar-|--time-----------|
  // |--------|--tweet----------|
  // avatar 
  var $avatar_div = $(document.createElement('div')).addClass('left');
  $avatar_div.append($(document.createElement('img')).addClass('avatar').attr('src', tweet.profile_image_url));
  var $tweet_tools = $(document.createElement('div')).addClass('tweet-tools');
  $avatar_div.append($tweet_tools);
  $tweet_tools.append(
    $(document.createElement('a')).attr('href',
        "https://twitter.com/intent/tweet?url=" + tweet.gs_url +
        "&hashtags=groundstream" +
        "&text=RT " + tweet.from_user +": " + tweet.text +
        "&related=ground_stream,reed").append(
          $(document.createElement('span')).addClass('twitter-icon retweet')
    )
  );
  $tweet_tools.append(
    $(document.createElement('a')).attr('href',
        "https://twitter.com/intent/favorite?tweet_id=" + tweet.id_str +
        "&related=ground_stream,reed").append(
          $(document.createElement('span')).addClass('twitter-icon favorite')
    )
  );

  // text
  var $wide_div = $(document.createElement('div')).addClass('right').css('width', '220px');
  $wide_div.append(
    $(document.createElement('strong')).append(tweet.from_user).append('<br />'));
  $wide_div.append(tweet.text);
  // div to hold it all
  var $tweet_itself = $(document.createElement('div')).addClass('opacity-tweet');
  $tweet_itself.append($avatar_div);
  $tweet_itself.append($wide_div);
  // time difference between Now and tweet time
  var time_diff = $(document.createElement('span')).addClass('small-text').append(tweet.gs_time + ' ago via ' + tweet.gs_service);
  $wide_div.append($(document.createElement('div')).addClass('clearfix'));
  $wide_div.append(time_diff);
  
  // hyperlink the img
  var $hyperlink = $(document.createElement('a')).attr('href', tweet.gs_url);
  // build it together
  $hyperlink.append($img);
  $render.append($hyperlink);
  $render.append($tweet_itself);
  
  // slap the tweet data on here for later
  $render.data('gs_tweet', tweet);
  
  return $render;
}

// UI buttons to load the town
function groundstream_load_town(_this) {
  var town = _this.innerHTML;
  $GROUNDSTREAM_SEARCHBOX.val(town);
  groundstream_run(town);
}


function groundstream_getUrlVars() {
  var vars = [], hash;
  var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
  for(var i = 0; i < hashes.length; i++) {
    hash = hashes[i].split('=');
    vars.push(hash[0]);
    vars[hash[0]] = hash[1];
  }
  return vars;
}

function groundstream_reset_canvas() {
  $('#crunch').html('loading!');
  window.scrollTo(0,0);
}
