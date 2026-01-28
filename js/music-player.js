  // ===========================
  // Music Player System
  // ===========================
  (function(){
    const $ = function(sel, el) {
      if(window.$) return window.$(sel, el);
      el = el || document;
      return el.querySelector(sel);
    };
    const $$ = function(sel, el) {
      if(window.$$) return window.$$(sel, el);
      el = el || document;
      return Array.from(el.querySelectorAll(sel));
    };
    const AudioSys = window.AudioSys || { enabled: true, click: () => {}, success: () => {}, bingo: () => {}, resume: () => {} };
    const openModal = window.openModal || function(html) { alert("Modal: " + html.replace(/<[^>]*>/g, "")); };
    const closeModal = window.closeModal || function() {};
    const showToast = window.showToast || function(msg){
      const t = document.createElement("div");
      t.className = "toast";
      t.textContent = msg;
      t.style.position = "fixed";
      t.style.bottom = "80px";
      t.style.right = "20px";
      t.style.zIndex = "10";
      document.body.appendChild(t);
      setTimeout(() => { t.remove(); }, 3000);
    };
    
    const MUSIC_STORAGE_KEY = "quest_bingo_music_v1";
    
    const MusicPlayer = (() => {
      let audioElement = null;
      let currentSong = null;
      let isPlaying = false;
      let currentSongIndex = 0;
      let progressInterval = null;
      let youtubeIframe = null;

      const pixelEmojis = [
        "🎮",
        "🎵",
        "🎸",
        "🎹",
        "🎺",
        "🎻",
        "🥁",
        "🎤",
        "🌟",
        "⭐",
        "✨",
        "💫",
        "🌙",
        "☀️",
        "☁️",
        "🌲",
        "🏠",
        "🌳",
        "🌿",
        "🍔",
        "🌸",
        "🌺",
        "🌻",
        "🍵",
        "⭐",
        "🧋",
        "🍰",
        "🍪",
        "🧁",
        "🍫",
        "🍬",
        "🎨",
        "🎭",
        "🗼",
        "📸",
        "🎬",
        "🎪",
        "🎯",
        "🎲",
        "🎁",
        "🦋",
        "🐝",
        "🐞",
        "🦌",
        "🐌",
        "🐂",
        "🐠",
        "🎈",
        "📚",
        "📖",
        "📝",
        "✏️",
        "🗊",
        "🗋",
        "📌",
        "📍",
        "💎",
        "📮",
        "🎉",
        "🎀",
        "🎊",
        "🎁",
        "🎈",
        "🎁"
      ];

      const pixelColors = [
        "#ff9f43", "#ff6b6b", "#4ecdc4", "#45b7d1",
        "#96ceb4", "#ffeaa7", "#dda0dd", "#98d8c8",
        "#f7dc6f", "#bb8fce", "#85c1e2", "#f8c471",
        "#82e0aa", "#f1948a", "#85c1e9", "#f9e79f",
        "#a569bd", "#5dade2", "#52be80", "#f4d03f",
        "#ec7063", "#5dade2", "#58d68d", "#f7dc6f"
      ];

      function getRandomEmoji(){
        return pixelEmojis[Math.floor(Math.random() * pixelEmojis.length)];
      }

      function getRandomColor(){
        return pixelColors[Math.floor(Math.random() * pixelColors.length)];
      }

      // Helper functions for Title_Artist format
      function formatTitleArtist(title, artist){
        if(!title) title = "Unknown";
        if(!artist) artist = "Unknown";
        return `${title}_${artist}`;
      }

      function parseTitleArtist(titleArtist){
        if(!titleArtist) return { title: "Unknown", artist: "Unknown" };
        const parts = titleArtist.split("_");
        if(parts.length === 1){
          const title = (parts[0] || "Unknown").replace(/-/g, " ");
          return { title: title, artist: "Unknown" };
        }
        const title = parts.slice(0, -1).join("_").replace(/-/g, " ");
        const artist = parts[parts.length - 1].replace(/-/g, " ");
        return { title: title || "Unknown", artist: artist || "Unknown" };
      }

      let songs = [];
      let shuffleMode = false;
      let repeatMode = false;
      let originalOrder = [];

      async function loadSongsFromFolder(){
        if(window.location.protocol === 'file:') return Promise.resolve();
        const loadedFiles = new Set();
        try{
          const listResponse = await fetch('./music/music-list.json');
          if(listResponse.ok){
            const list = await listResponse.json();
            if(Array.isArray(list)){
              for(const item of list){
                const fileName = item.file || item;
                const url = `./music/${fileName}`;
                loadedFiles.add(fileName.toLowerCase());
                const exists = songs.find(s => s.url === url || (s.file && s.file.toLowerCase() === fileName.toLowerCase()));
                if(!exists){
                  const title = item.name || fileName.replace(/\.[^/.]+$/, "").replace(/-/g, " ").replace(/_/g, " ");
                  const artistName = item.artist || "Music Folder";
                  songs.push({
                    titleArtist: formatTitleArtist(title, artistName),
                    name: title,
                    artist: artistName,
                    emoji: item.emoji || getRandomEmoji(),
                    color: item.color || getRandomColor(),
                    type: "mp3",
                    url: url,
                    file: fileName,
                    fromFolder: true
                  });
                }
              }
            }
          }
        }catch(e){}
        try{
          const dirResponse = await fetch('./music/');
          if(dirResponse.ok){
            const html = await dirResponse.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const links = doc.querySelectorAll('a[href$=".mp3"]');
            
            for(const link of links){
              let fileName = link.getAttribute('href');
              if(!fileName || loadedFiles.has(fileName.toLowerCase())) continue;
              fileName = fileName.split('?')[0].split('#')[0];
              const url = `./music/${fileName}`;
              const exists = songs.find(s => {
                const sUrl = s.url || '';
                const sFile = s.file || '';
                return sUrl.toLowerCase() === url.toLowerCase() || 
                       sFile.toLowerCase() === fileName.toLowerCase();
              });
              if(exists){
                loadedFiles.add(fileName.toLowerCase());
                continue;
              }
              try{
                const testResponse = await fetch(url, { method: 'HEAD' });
                if(!testResponse.ok) continue;
              }catch(e){}
              const baseName = fileName.replace(/\.[^/.]+$/, "");
              const parsed = parseTitleArtist(baseName);
              
              songs.push({
                titleArtist: formatTitleArtist(parsed.title, parsed.artist),
                name: parsed.title,
                artist: parsed.artist,
                emoji: getRandomEmoji(),
                color: getRandomColor(),
                type: "mp3",
                url: url,
                file: fileName,
                fromFolder: true
              });
              
              loadedFiles.add(fileName.toLowerCase());
            }
          }
        }catch(e){}
      }

      function loadSongs(){
        const saved = localStorage.getItem(MUSIC_STORAGE_KEY);
        if(saved){
          try{
            const data = JSON.parse(saved);
            if(Array.isArray(data)){
              songs = data.map(song => {
                if(!song.titleArtist && song.name){
                  const title = song.name || "Unknown";
                  const artist = song.artist || "Unknown";
                  return {
                    ...song,
                    titleArtist: formatTitleArtist(title, artist)
                  };
                }
                return song;
              });
            }
          }catch(e){}
        }
      }

      function saveSongs(){
        localStorage.setItem(MUSIC_STORAGE_KEY, JSON.stringify(songs));
      }

      function extractYouTubeId(url){
        if(!url || typeof url !== 'string') return null;
        const trimmed = url.trim();
        const patterns = [
          /youtu\.be\/([a-zA-Z0-9_-]{11})/,
          /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
          /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
          /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
          /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
          /youtube\.com\/watch\?.*[?&]v=([a-zA-Z0-9_-]{11})/
        ];
        for(const pattern of patterns){
          const match = trimmed.match(pattern);
          if(match && match[1]) return match[1];
        }
        return null;
      }

      function playSong(index){
        if(index < 0 || index >= songs.length){
          showToast("No songs available. Upload MP3 or add YouTube link!");
          return;
        }
        
        stop();
        currentSongIndex = index;
        currentSong = songs[index];
        
        if(currentSong.type === "youtube"){
          playYouTube(currentSong.youtubeId);
          isPlaying = true;
          updateUI();
          updateProgress();
        }else if(currentSong.type === "mp3"){
          const playPromise = playMP3(currentSong.url);
          updateUI();
          return playPromise;
        }else{
          showToast("Error: Unknown song type");
          return;
        }
      }

      function playMP3(url){
        if(audioElement){
          audioElement.pause();
          audioElement = null;
        }
        audioElement = new Audio(url);
        audioElement.loop = true;
        audioElement.volume = 0.7;
        if(window.location.protocol !== 'file:' && !url.startsWith('blob:') && !url.startsWith('data:')) {
          audioElement.crossOrigin = "anonymous";
        }
        audioElement.addEventListener("play", () => {
          isPlaying = true;
          updateUI();
          updateProgress();
        });
        
        audioElement.addEventListener("error", (e) => {
          const fileName = url.split('/').pop().split('\\').pop();
          let errorMsg = `Error playing: ${fileName}`;
          if(window.location.protocol === 'file:') {
            errorMsg += " (use a local web server)";
          } else if(audioElement && audioElement.error){
            switch(audioElement.error.code){
              case 1: errorMsg += " (MEDIA_ERR_ABORTED)"; break;
              case 2: errorMsg += " (Network error - check file path)"; break;
              case 3: errorMsg += " (Decode error - invalid file format)"; break;
              case 4: errorMsg += " (Source not supported or CORS blocked)"; break;
            }
          } else {
            errorMsg += " (Unknown error - file may not be accessible)";
          }
          
          if(showToast) showToast(errorMsg);
          stop();
        });
        audioElement.addEventListener("ended", () => {
          handleSongEnd();
        });
        
        return audioElement.play().catch(e => {
          const fileName = url.split('/').pop().split('\\').pop();
          let errorMsg = `Could not play: ${fileName}`;
          if(e.name === 'NotAllowedError') {
          } else if(e.name === 'NotSupportedError') {
            errorMsg += " (File format not supported or CORS blocked)";
            if(showToast) showToast(errorMsg);
          } else {
            errorMsg += ". Check file format or path.";
            if(showToast) showToast(errorMsg);
          }
          stop();
          throw e;
        });
      }

      function playYouTube(videoId){
        if(!videoId){
          showToast("Invalid YouTube video ID");
          return;
        }
        if(youtubeIframe){
          youtubeIframe.remove();
          youtubeIframe = null;
        }
        
        try {
          youtubeIframe = document.createElement("iframe");
          youtubeIframe.style.display = "none";
          youtubeIframe.width = "0";
          youtubeIframe.height = "0";
          youtubeIframe.allow = "autoplay; encrypted-media";
          youtubeIframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&loop=${repeatMode ? 1 : 0}&playlist=${repeatMode ? videoId : ''}&enablejsapi=1&controls=0&modestbranding=1`;
          youtubeIframe.setAttribute("frameborder", "0");
          youtubeIframe.setAttribute("allowfullscreen", "1");
          youtubeIframe.onerror = () => {
            showToast("Failed to load YouTube video");
            stop();
          };
          
          document.body.appendChild(youtubeIframe);
        } catch(e) {
          showToast("Error playing YouTube video");
          stop();
        }
      }

      function stop(){
        isPlaying = false;
        if(audioElement){
          audioElement.pause();
          audioElement = null;
        }
        if(youtubeIframe){
          youtubeIframe.remove();
          youtubeIframe = null;
        }
        if(progressInterval){
          clearInterval(progressInterval);
          progressInterval = null;
        }
        $("#musicProgress").style.width = "0%";
        updateUI();
      }

      function pause(){
        if(isPlaying){
          if(audioElement){
            audioElement.pause();
          }
          if(youtubeIframe){
            stop();
            return;
          }
          isPlaying = false;
        }else{
          if(audioElement){
            audioElement.play();
            isPlaying = true;
          }
        }
        updateUI();
      }

      function updateProgress(){
        if(progressInterval) clearInterval(progressInterval);
        
        progressInterval = setInterval(() => {
          if(audioElement && !audioElement.paused){
            const progress = (audioElement.currentTime / audioElement.duration) * 100;
            $("#musicProgress").style.width = (progress || 0) + "%";
          }else if(youtubeIframe){
            $("#musicProgress").style.width = "50%";
          }
        }, 100);
      }

      function updateUI(){
        if(currentSong){
          const parsed = parseTitleArtist(currentSong.titleArtist || currentSong.name);
          $("#musicSongName").textContent = parsed.title;
          $("#musicArtist").textContent = parsed.artist;
          $("#musicArtwork").textContent = currentSong.emoji || "🎵";
          if(currentSong.color){
            $("#musicArtwork").style.background = `linear-gradient(135deg, ${currentSong.color}, ${currentSong.color}dd)`;
          }else{
            $("#musicArtwork").style.background = "linear-gradient(135deg, #7a6cff, #5a4dff)";
          }
          
        }
        
        $("#musicPlay").textContent = isPlaying ? "⏸" : "▶";
        
        $$(".music-playlist-item").forEach((item, i) => {
          item.classList.toggle("active", i === currentSongIndex);
        });
      }

      function renderPlaylist(){
        const playlist = $("#musicPlaylist");
        if(!playlist){
          setTimeout(renderPlaylist, 100);
          return;
        }
        playlist.innerHTML = "";
        if(songs.length === 0){
          playlist.innerHTML = `
            <div style="padding:20px; text-align:center; color:#666;">
              <div style="font-size:32px; margin-bottom:8px;">🎵</div>
              <div style="font-weight:700; margin-bottom:4px;">No songs yet</div>
              <div style="font-size:11px;">Upload MP3 or add YouTube link to get started!</div>
            </div>
          `;
          return;
        }
        
        songs.forEach((song, i) => {
          const item = document.createElement("div");
          item.className = "music-playlist-item";
          if(song.type === "mp3") item.classList.add("custom");
          if(song.type === "youtube") item.classList.add("youtube");
          if(i === currentSongIndex) item.classList.add("active");
          const parsed = parseTitleArtist(song.titleArtist || song.name);
          
          const actionButtons = `
            <div class="action-buttons">
              <button class="action-btn edit" data-index="${i}" title="Edit">✏️</button>
              <button class="action-btn delete-btn" data-index="${i}" title="Delete">🗑</button>
            </div>
          `;
          
          item.innerHTML = `
            <div class="music-playlist-artwork" style="background:linear-gradient(135deg, ${song.color || "#7a6cff"}, ${song.color ? song.color + "dd" : "#5a4dff"});">${song.emoji || "🎵"}</div>
            <div class="music-playlist-info">
              <div class="music-playlist-name">${parsed.title}</div>
              <div class="music-playlist-artist">${parsed.artist}</div>
            </div>
            ${actionButtons}
          `;
          
          item.onclick = (e) => {
            if(e.target.classList.contains("delete-btn") || e.target.closest(".delete-btn")){
              e.stopPropagation();
              deleteSong(i);
              return;
            }
            if(e.target.classList.contains("edit") || e.target.closest(".edit")){
              e.stopPropagation();
              editSong(i);
              return;
            }
            if(currentSongIndex === i && isPlaying){
              pause();
            }else{
              playSong(i);
            }
          };
          
          playlist.appendChild(item);
        });
      }

      function editSong(index){
        if(index < 0 || index >= songs.length) return;
        const song = songs[index];
        const parsed = parseTitleArtist(song.titleArtist || song.name);
        
        openModal(`
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div>
              <div style="font-weight:900; font-size:18px;">✏️ Edit Song</div>
              <div style="font-size:12px; color:#666;">Update song information (format: Title_Artist)</div>
            </div>
            <button id="eClose" class="btn ghost">Close</button>
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block; font-weight:700; font-size:12px; margin-bottom:6px;">Title</label>
            <input id="eName" class="field" value="${parsed.title}" />
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block; font-weight:700; font-size:12px; margin-bottom:6px;">Artist</label>
            <input id="eArtist" class="field" value="${parsed.artist}" />
          </div>
          <div style="display:flex; gap:8px; justify-content:flex-end;">
            <button id="eCancel" class="btn ghost">Cancel</button>
            <button id="eSave" class="btn">💾 Save</button>
          </div>
        `);

        $("#eClose").onclick = closeModal;
        $("#eCancel").onclick = closeModal;
        $("#eSave").onclick = () => {
          const title = $("#eName").value.trim();
          const artist = $("#eArtist").value.trim();
          if(title){
            songs[index].titleArtist = formatTitleArtist(title, artist);
            songs[index].name = title;
            songs[index].artist = artist || "Unknown";
            saveSongs();
            renderPlaylist();
            updateUI();
            closeModal();
            AudioSys.success();
          }
        };
      }

      function deleteSong(index){
        if(index < 0 || index >= songs.length) return;
        const song = songs[index];
        const parsed = parseTitleArtist(song.titleArtist || song.name);
        
        openModal(`
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div>
              <div style="font-weight:900; font-size:18px;">🗑️ Delete Song</div>
              <div style="font-size:12px; color:#666;">Are you sure you want to delete this song?</div>
            </div>
            <button id="dClose" class="btn ghost">Close</button>
          </div>
          <div style="padding:12px; background:#fff; border:2px solid #222; border-radius:6px; margin-bottom:12px;">
            <div style="font-weight:900; font-size:14px;">${parsed.title}</div>
            <div style="font-size:11px; color:#666;">${parsed.artist}</div>
          </div>
          <div style="display:flex; gap:8px; justify-content:flex-end;">
            <button id="dCancel" class="btn ghost">Cancel</button>
            <button id="dConfirm" class="btn" style="background:linear-gradient(#ff5c5c,#ff3d3d); border-color:#5a1a1a;">🗑️ Delete</button>
          </div>
        `);

        $("#dClose").onclick = closeModal;
        $("#dCancel").onclick = closeModal;
        $("#dConfirm").onclick = () => {
          const wasPlaying = isPlaying && index === currentSongIndex;
          songs.splice(index, 1);
          if(currentSongIndex >= songs.length) currentSongIndex = Math.max(0, songs.length - 1);
          if(songs.length === 0) currentSongIndex = 0;
          saveSongs();
          renderPlaylist();
          if(wasPlaying){
            stop();
          }
          updateUI();
          closeModal();
          AudioSys.click(220, 0.05, "sine", 0.04);
        };
      }

      function addMP3(file, name, artist){
        const title = name || file.name.replace(/\.[^/.]+$/, "");
        const artistName = artist || "Uploaded";
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const dataUrl = e.target.result;
            const newSong = {
              titleArtist: formatTitleArtist(title, artistName),
              name: title,
              artist: artistName,
              emoji: getRandomEmoji(),
              color: getRandomColor(),
              type: "mp3",
              url: dataUrl,
              file: file.name,
              isUploaded: true,
              dateAdded: Date.now()
            };
            songs.push(newSong);
            const index = songs.length - 1;
            saveSongs();
            renderPlaylist();
            if(songs.length === 1){
              playSong(0);
            }
            
            resolve(index);
          };
          reader.onerror = () => {
            const url = URL.createObjectURL(file);
            const newSong = {
              titleArtist: formatTitleArtist(title, artistName),
              name: title,
              artist: artistName,
              emoji: getRandomEmoji(),
              color: getRandomColor(),
              type: "mp3",
              url: url,
              file: file.name,
              isUploaded: true
            };
            songs.push(newSong);
            const index = songs.length - 1;
            saveSongs();
            renderPlaylist();
            resolve(index);
          };
          reader.readAsDataURL(file);
        });
      }

      function addYouTube(url, name, artist){
        const videoId = extractYouTubeId(url);
        if(!videoId){
          return null;
        }
        const title = name || "YouTube Video";
        const artistName = artist || "YouTube";
        const newSong = {
          titleArtist: formatTitleArtist(title, artistName),
          name: title,
          artist: artistName,
          emoji: getRandomEmoji(),
          color: getRandomColor(),
          type: "youtube",
          youtubeId: videoId,
          url: url,
          dateAdded: Date.now()
        };
        songs.push(newSong);
        saveSongs();
        renderPlaylist();
        return songs.length - 1;
      }

      function next(){
        if(songs.length === 0) return;
        let nextIndex;
        if(shuffleMode){
          nextIndex = Math.floor(Math.random() * songs.length);
        }else{
          nextIndex = (currentSongIndex + 1) % songs.length;
        }
        playSong(nextIndex);
      }

      function prev(){
        if(songs.length === 0) return;
        let prevIndex;
        if(shuffleMode){
          prevIndex = Math.floor(Math.random() * songs.length);
        }else{
          prevIndex = (currentSongIndex - 1 + songs.length) % songs.length;
        }
        playSong(prevIndex);
      }

      function handleSongEnd(){
        if(repeatMode){
          playSong(currentSongIndex);
        }else{
          next();
        }
      }

      function toggleShuffle(){
        shuffleMode = !shuffleMode;
        updateQueueUI();
        AudioSys.click(440, 0.05, "triangle", 0.04);
      }

      function toggleRepeat(){
        repeatMode = !repeatMode;
        updateQueueUI();
        AudioSys.click(440, 0.05, "triangle", 0.04);
      }

      function updateQueueUI(){
        const shuffleBtn = $("#musicShuffle");
        const repeatBtn = $("#musicRepeat");
        if(shuffleBtn){
          shuffleBtn.classList.toggle("active", shuffleMode);
          shuffleBtn.style.opacity = shuffleMode ? "1" : "0.6";
        }
        if(repeatBtn){
          repeatBtn.classList.toggle("active", repeatMode);
          repeatBtn.style.opacity = repeatMode ? "1" : "0.6";
        }
      }


      loadSongs();

      return {
        play: (index) => {
          try {
            const result = playSong(index);
            if(result && typeof result.then === 'function') return result;
            return Promise.resolve();
          } catch(e) {
            return Promise.reject(e);
          }
        },
        pause: () => pause(),
        stop: () => stop(),
        next: () => next(),
        prev: () => prev(),
        addMP3: (file, name, artist) => addMP3(file, name, artist),
        addYouTube: (url, name, artist) => addYouTube(url, name, artist),
        get currentIndex() { return currentSongIndex; },
        get isPlaying() { return isPlaying; },
        get songsCount() { return songs.length; },
        loadSongs: () => loadSongs(),
        loadSongsFromFolder: () => loadSongsFromFolder(),
        editSong: (index) => editSong(index),
        deleteSong: (index) => deleteSong(index),
        saveSongs: () => saveSongs(),
        updateQueueUI: () => updateQueueUI(),
        renderPlaylist,
        updateUI
      };
    })();

    // Load songs from folder and initialize
    (async () => {
      const initMusicPlayer = async () => {
        MusicPlayer.loadSongs();
        const uploadedCount = MusicPlayer.songsCount;
        await MusicPlayer.loadSongsFromFolder();
        MusicPlayer.saveSongs();
        let retries = 0;
        const renderWithRetry = () => {
          const playlist = $("#musicPlaylist");
          if(!playlist && retries < 10){
            retries++;
            setTimeout(renderWithRetry, 100);
            return;
          }
          MusicPlayer.renderPlaylist();
        };
        renderWithRetry();
        if(MusicPlayer.songsCount > 0){
          setTimeout(() => {
            MusicPlayer.play(0).catch(e => {
              if(e.name === 'NotAllowedError' || e.message.includes('user didn\'t interact')) {
                const tryAutoPlay = () => {
                  if(MusicPlayer) MusicPlayer.play(0);
                  document.removeEventListener("click", tryAutoPlay);
                  document.removeEventListener("touchstart", tryAutoPlay);
                };
                document.addEventListener("click", tryAutoPlay, { once: true });
                document.addEventListener("touchstart", tryAutoPlay, { once: true });
              }
            });
          }, 500);
        }
      };
      
      if(document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMusicPlayer);
      } else {
        initMusicPlayer();
      }
    })();


    // Wire up controls
    function wireUpControls(){
      if(!MusicPlayer){
        setTimeout(wireUpControls, 100);
        return;
      }
      
      const btnMusic = $("#btnMusic");
      const musicToggle = $("#musicToggle");
      const musicPlayer = $("#musicPlayer");
      const musicPlay = $("#musicPlay");
      const musicNext = $("#musicNext");
      const musicPrev = $("#musicPrev");
      const musicUploadBtn = $("#musicUploadBtn");
      const musicFileInput = $("#musicFileInput");
      const musicYoutubeBtn = $("#musicYoutubeBtn");
      
      if(!btnMusic || !musicToggle || !musicPlayer || !musicPlay || !musicNext || !musicPrev || !musicUploadBtn || !musicFileInput || !musicYoutubeBtn){
        setTimeout(wireUpControls, 100);
        return;
      }
      
      function updateCollapsedIcon(){
        const player = $("#musicPlayer");
        if(!player) return;
        const isCollapsed = player.classList.contains("collapsed");
        const toggle = $("#musicToggle");
        if(toggle) toggle.textContent = isCollapsed ? "▲" : "▼";
      }
      
      btnMusic.onclick = () => {
        const player = $("#musicPlayer");
        if(player){
          player.classList.toggle("collapsed");
          updateCollapsedIcon();
          if(AudioSys && AudioSys.click) AudioSys.click(440, 0.05, "triangle", 0.04);
        }
      };

      musicToggle.onclick = () => {
        const player = $("#musicPlayer");
        if(player){
          player.classList.toggle("collapsed");
          updateCollapsedIcon();
          if(AudioSys && AudioSys.click) AudioSys.click(440, 0.05, "triangle", 0.04);
        }
      };
      musicPlay.onclick = () => {
        try {
          if(MusicPlayer && MusicPlayer.isPlaying){
            MusicPlayer.pause();
          }else if(MusicPlayer){
            MusicPlayer.play(MusicPlayer.currentIndex);
          }
          if(AudioSys && AudioSys.click) AudioSys.click(440, 0.05, "triangle", 0.04);
        } catch(e) {}
      };
      musicNext.onclick = () => {
        if(MusicPlayer) {
          MusicPlayer.next();
          if(AudioSys && AudioSys.click) AudioSys.click(440, 0.05, "triangle", 0.04);
        }
      };

      musicPrev.onclick = () => {
        if(MusicPlayer) {
          MusicPlayer.prev();
          if(AudioSys && AudioSys.click) AudioSys.click(440, 0.05, "triangle", 0.04);
        }
      };
      musicUploadBtn.onclick = () => {
        if(musicFileInput) musicFileInput.click();
      };
      musicYoutubeBtn.onclick = () => {
        openModal(`
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div>
              <div style="font-weight:900; font-size:18px;">▶ YouTube Link</div>
              <div style="font-size:12px; color:#666;">Add a YouTube video to play</div>
            </div>
            <button id="yClose" class="btn ghost">Close</button>
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block; font-weight:700; font-size:12px; margin-bottom:6px;">YouTube URL</label>
            <input id="yUrl" class="field" placeholder="https://youtube.com/watch?v=..." autofocus />
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block; font-weight:700; font-size:12px; margin-bottom:6px;">Song Name (optional)</label>
            <input id="yName" class="field" placeholder="Enter song name" />
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block; font-weight:700; font-size:12px; margin-bottom:6px;">Artist (optional)</label>
            <input id="yArtist" class="field" placeholder="Enter artist name" />
          </div>
          <div style="display:flex; gap:8px; justify-content:flex-end;">
            <button id="yCancel" class="btn ghost">Cancel</button>
            <button id="ySave" class="btn">Add Song</button>
          </div>
        `);

        $("#yClose").onclick = closeModal;
        $("#yCancel").onclick = closeModal;
        $("#ySave").onclick = () => {
          const url = $("#yUrl").value.trim();
          if(!url){
            alert("Please enter a YouTube URL");
            return;
          }
          const name = $("#yName").value.trim();
          const artist = $("#yArtist").value.trim();
          if(!MusicPlayer) {
            alert("Music player not initialized. Please refresh the page.");
            return;
          }
          const index = MusicPlayer.addYouTube(url, name, artist);
          if(index === null){
            alert("Invalid YouTube URL. Please use a valid YouTube link.");
            return;
          }
          closeModal();
          if(MusicPlayer) MusicPlayer.play(index);
          if(AudioSys && AudioSys.success) AudioSys.success();
        };
      };
      musicFileInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if(!file) return;
        const isAudio = file.type.startsWith("audio/") || /\.(mp3|m4a|ogg|wav|aac)$/i.test(file.name);
        if(!isAudio){
          alert("Please select an audio file (MP3, M4A, etc.)");
          e.target.value = "";
          return;
        }
        const baseName = file.name.replace(/\.[^/.]+$/, "");
        const lastUnderscore = baseName.lastIndexOf("_");
        const defaultTitle = lastUnderscore > 0 ? baseName.slice(0, lastUnderscore).replace(/-/g, " ") : baseName.replace(/-/g, " ");
        const defaultArtist = lastUnderscore > 0 ? baseName.slice(lastUnderscore + 1).replace(/-/g, " ") : "Uploaded";
        const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
        let selectedFile = file;
        openModal(`
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div>
              <div style="font-weight:900; font-size:18px;">Upload MP3</div>
              <div style="font-size:12px; color:#666;">Add your music file (Title_Artist)</div>
            </div>
            <button id="mClose" class="btn ghost">Close</button>
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block; font-weight:700; font-size:12px; margin-bottom:6px;">Title</label>
            <input id="mName" class="field" placeholder="Song title" value="${esc(defaultTitle)}" />
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block; font-weight:700; font-size:12px; margin-bottom:6px;">Artist</label>
            <input id="mArtist" class="field" placeholder="Artist name" value="${esc(defaultArtist)}" />
          </div>
          <div style="display:flex; gap:8px; justify-content:flex-end;">
            <button id="mCancel" class="btn ghost">Cancel</button>
            <button id="mSave" class="btn">Add Song</button>
          </div>
        `);
        $("#mClose").onclick = () => { if(musicFileInput) musicFileInput.value = ""; closeModal(); };
        $("#mCancel").onclick = () => { if(musicFileInput) musicFileInput.value = ""; closeModal(); };
        $("#mSave").onclick = () => {
          if(!MusicPlayer){ alert("Music player not initialized. Please refresh."); return; }
          if(!selectedFile){ alert("File not found. Try again."); return; }
          const name = $("#mName").value.trim() || defaultTitle;
          const artist = $("#mArtist").value.trim() || "Uploaded";
          MusicPlayer.addMP3(selectedFile, name, artist).then((index) => {
            if(musicFileInput) musicFileInput.value = "";
            closeModal();
            if(MusicPlayer && (index === 0 || index)) MusicPlayer.play(index).catch(() => {});
            if(AudioSys && AudioSys.success) AudioSys.success();
          }).catch(() => {
            alert("Failed to add song. Try a smaller file or different format.");
            if(musicFileInput) musicFileInput.value = "";
          });
        };
      });
      updateCollapsedIcon();
    }
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', wireUpControls);
    } else {
      wireUpControls();
    }
  })();
