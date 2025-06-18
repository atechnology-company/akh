<script lang="ts">
	import { onMount } from 'svelte';
	import { currentLanguage } from '$lib/i18n';
	import { browser } from '$app/environment';
	import { marked } from 'marked';

	// Component state
	let isLoading = true;
	let surahs: any[] = [];
	let currentSurah = 1;
	let currentAyah = 1;
	let currentVerseData: any = null;
	let allVerses: any[] = [];
	let currentView: 'list' | 'verse' = 'verse';
	let selectedLanguage = 'english';
	let isPlaying = false;
	let currentAudio: HTMLAudioElement | null = null;
	let currentReciter = 1; // Mishary Rashid Al Afasy
	
	// Visible verse range tracking
	let visibleVerseRange = { start: 1, end: 1 };
	let visibleVerses: Set<number> = new Set();
	
	// Navigation debounce
	let lastNavigationTime = 0;

	// Tafseer modal state
	let showTafseerModal = false;
	let selectedTafseerVerse: any = null;
	let tafseerData: any = null;
	let tafseerLoading = false;
	let selectedTafseerAuthor = 'Ibn Kathir';
	let longPressTimer: number | null = null;
	let pressStarted = false;

	// Available reciters from the API
	const reciters = [
		{ id: 1, name: 'Mishary Rashid Al Afasy' },
		{ id: 2, name: 'Abu Bakr Al Shatri' },
		{ id: 3, name: 'Nasser Al Qatami' },
		{ id: 4, name: 'Yasser Al Dosari' },
		{ id: 5, name: 'Hani Ar Rifai' }
	];

	// Available tafseer authors
	const tafseerAuthors = [
		'Ibn Kathir',
		'Maarif Ul Quran', 
		'Tazkirul Quran'
	];

	// Available languages
	const languages = [
		{ key: 'english', name: 'English' },
		{ key: 'arabic1', name: 'Arabic (with Tashkeel)' },
		{ key: 'arabic2', name: 'Arabic (without Tashkeel)' },
		{ key: 'bengali', name: 'Bengali' },
		{ key: 'urdu', name: 'Urdu' },
		{ key: 'uzbek', name: 'Uzbek' }
	];

	// Cookie functions for settings
	function setCookie(name: string, value: string, days: number = 365) {
		if (!browser) return;
		const expires = new Date();
		expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
		document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
	}

	function getCookie(name: string): string | null {
		if (!browser) return null;
		const nameEQ = name + '=';
		const ca = document.cookie.split(';');
		for (let i = 0; i < ca.length; i++) {
			let c = ca[i];
			while (c.charAt(0) === ' ') c = c.substring(1, c.length);
			if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
		}
		return null;
	}

	// LocalStorage functions for verse position
	function saveCurrentPosition() {
		if (!browser) return;
		try {
			const position = {
				surah: currentSurah,
				ayah: currentAyah,
				timestamp: Date.now()
			};
			localStorage.setItem('quran_current_position', JSON.stringify(position));
		} catch (error) {
			console.error('Failed to save position to localStorage:', error);
		}
	}

	function loadCurrentPosition() {
		if (!browser) return null;
		try {
			const saved = localStorage.getItem('quran_current_position');
			if (saved) {
				const position = JSON.parse(saved);
				// Only load if it's recent (within last 30 days)
				if (Date.now() - position.timestamp < 30 * 24 * 60 * 60 * 1000) {
					return position;
				}
			}
		} catch (error) {
			console.error('Failed to load position from localStorage:', error);
		}
		return null;
	}

	function saveProgress() {
		setCookie('quran_current_surah', currentSurah.toString());
		setCookie('quran_current_ayah', currentAyah.toString());
		setCookie('quran_language', selectedLanguage);
		setCookie('quran_reciter', currentReciter.toString());
		setCookie('quran_view', currentView);
		setCookie('quran_tafseer_author', selectedTafseerAuthor);
	}

	function loadProgress() {
		const savedSurah = getCookie('quran_current_surah');
		const savedAyah = getCookie('quran_current_ayah');
		const savedLanguage = getCookie('quran_language');
		const savedReciter = getCookie('quran_reciter');
		const savedView = getCookie('quran_view');
		const savedTafseerAuthor = getCookie('quran_tafseer_author');

		// Load from localStorage first (most recent position)
		const savedPosition = loadCurrentPosition();
		
		if (savedPosition) {
			currentSurah = savedPosition.surah;
			currentAyah = savedPosition.ayah;
		} else {
			// Fallback to cookie values
			if (savedSurah) currentSurah = parseInt(savedSurah);
			if (savedAyah) currentAyah = parseInt(savedAyah);
		}
		
		if (savedLanguage) selectedLanguage = savedLanguage;
		if (savedReciter) currentReciter = parseInt(savedReciter);
		if (savedView) currentView = savedView as 'list' | 'verse';
		if (savedTafseerAuthor) selectedTafseerAuthor = savedTafseerAuthor;
	}

	// Long press handlers for tafseer modal
	function handleVerseMouseDown(verse: any) {
		pressStarted = true;
		longPressTimer = setTimeout(() => {
			if (pressStarted) {
				openTafseerModal(verse);
			}
		}, 500) as unknown as number;
	}

	function handleVerseMouseUp() {
		pressStarted = false;
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	}

	function handleVerseTouchStart(verse: any) {
		pressStarted = true;
		longPressTimer = setTimeout(() => {
			if (pressStarted) {
				openTafseerModal(verse);
			}
		}, 500) as unknown as number;
	}

	function handleVerseTouchEnd() {
		pressStarted = false;
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	}

	async function openTafseerModal(verse: any) {
		selectedTafseerVerse = verse;
		showTafseerModal = true;
		await fetchTafseer(verse.surahNo, verse.ayahNo);
	}

	function closeTafseerModal() {
		showTafseerModal = false;
		selectedTafseerVerse = null;
		tafseerData = null;
	}

	// API functions
	async function fetchSurahs() {
		try {
			const response = await fetch('https://quranapi.pages.dev/api/surah.json');
			const data = await response.json();
			surahs = data.map((surah: any, index: number) => ({
				...surah,
				surahNumber: index + 1
			}));
		} catch (error) {
			console.error('Error fetching surahs:', error);
		}
	}

	async function fetchTafseer(surahNo: number, ayahNo: number) {
		try {
			tafseerLoading = true;
			const response = await fetch(`https://quranapi.pages.dev/api/tafsir/${surahNo}_${ayahNo}.json`);
			if (!response.ok) throw new Error('Failed to fetch tafseer');
			const data = await response.json();
			tafseerData = data;
		} catch (error) {
			console.error('Error fetching tafseer:', error);
			tafseerData = null;
		} finally {
			tafseerLoading = false;
		}
	}

	// Loading state for main content
	let contentLoading = false;
	
	// Animation and transition states
	let isTransitioning = false;
	let showChapterTransition = false;
	let transitionDirection: 'next' | 'prev' = 'next';
	let transitionSurahNumber = 1;
	
	// Chapter preloading for verse view
	let currentChapterVerses: any[] = [];
	let isChapterLoaded = false;
	
	// Intersection observer for automatic ayah tracking
	let versesInView: Set<number> = new Set();
	let intersectionObserver: IntersectionObserver;
	
	// Loading states for different surahs
	let loadingSurahs: Set<number> = new Set();
	let loadedSurahRange = { start: 0, end: 0 };

	// Fix the async functions to handle loading properly
	async function fetchCurrentVerse() {
		try {
			// If chapter is already loaded, get verse from cache
			if (isChapterLoaded && currentChapterVerses.length > 0) {
				const verse = currentChapterVerses.find(v => v.ayahNo === currentAyah);
				if (verse) {
					currentVerseData = verse;
					return;
				}
			}
			
			contentLoading = true;
			const response = await fetch(`https://quranapi.pages.dev/api/${currentSurah}/${currentAyah}.json`);
			if (!response.ok) throw new Error('Failed to fetch verse');
			const data = await response.json();
			currentVerseData = data;
		} catch (error) {
			console.error('Error fetching verse:', error);
		} finally {
			contentLoading = false;
		}
	}
	
	// Preload entire chapter for verse view
	async function preloadCurrentChapter() {
		try {
			const surahData = surahs.find(s => s.surahNumber === currentSurah);
			if (!surahData) return;

			// Fetch all verses in the current chapter
			const verses = [];
			const batchSize = 10;
			for (let i = 1; i <= surahData.totalAyah; i += batchSize) {
				const batchPromises = [];
				for (let j = i; j < Math.min(i + batchSize, surahData.totalAyah + 1); j++) {
					batchPromises.push(
						fetch(`https://quranapi.pages.dev/api/${currentSurah}/${j}.json`)
							.then(response => response.json())
					);
				}
				const batchResults = await Promise.all(batchPromises);
				verses.push(...batchResults);
			}
			currentChapterVerses = verses;
			isChapterLoaded = true;
			
			// Set current verse data
			const verse = currentChapterVerses.find(v => v.ayahNo === currentAyah);
			if (verse) {
				currentVerseData = verse;
			}
		} catch (error) {
			console.error('Error preloading chapter:', error);
		}
	}

	async function fetchAllVerses(surahNumber: number, append: boolean = false) {
		try {
			if (!append) {
				contentLoading = true;
				allVerses = [];
				loadedSurahRange = { start: surahNumber, end: surahNumber };
			}
			
			const surahData = surahs.find(s => s.surahNumber === surahNumber);
			if (!surahData) return;

			loadingSurahs.add(surahNumber);

			// Fetch verses in batches of 10 for better performance
			const verses = [];
			const batchSize = 10;
			for (let i = 1; i <= surahData.totalAyah; i += batchSize) {
				const batchPromises = [];
				for (let j = i; j < Math.min(i + batchSize, surahData.totalAyah + 1); j++) {
					batchPromises.push(
						fetch(`https://quranapi.pages.dev/api/${surahNumber}/${j}.json`)
							.then(response => response.json())
					);
				}
				const batchResults = await Promise.all(batchPromises);
				verses.push(...batchResults);
			}
			
			if (append) {
				allVerses = [...allVerses, ...verses];
				loadedSurahRange.end = surahNumber;
			} else {
				allVerses = verses;
			}
			
			// Also update chapter cache for verse view
			if (surahNumber === currentSurah) {
				currentChapterVerses = verses;
				isChapterLoaded = true;
			}
			
			loadingSurahs.delete(surahNumber);
		} catch (error) {
			console.error('Error fetching verses:', error);
			loadingSurahs.delete(surahNumber);
		} finally {
			if (!append) {
				contentLoading = false;
			}
		}
	}

	function selectVerse(surahNumber: number, ayahNumber: number) {
		const wasChapterChange = currentSurah !== surahNumber;
		currentSurah = surahNumber;
		currentAyah = ayahNumber;
		
		// Reset visible range when changing surah
		if (wasChapterChange) {
			visibleVerseRange = { start: ayahNumber, end: ayahNumber };
			visibleVerses = new Set([ayahNumber]);
			visibleElements.clear(); // Clear the visibility tracking map
		} else {
			// Update visible verses to include the selected ayah and update range
			visibleVerses.add(ayahNumber);
			visibleVerseRange = { 
				start: Math.min(visibleVerseRange.start, ayahNumber), 
				end: Math.max(visibleVerseRange.end, ayahNumber) 
			};
		}
		
		saveProgress();
		saveCurrentPosition(); // Save to localStorage
		
		if (currentView === 'verse') {
			if (wasChapterChange) {
				isChapterLoaded = false;
				currentChapterVerses = [];
				preloadCurrentChapter();
			} else {
				fetchCurrentVerse();
			}
		} else {
			// In list view, ensure the target surah is loaded and scroll to verse
			if (wasChapterChange || !allVerses.find(v => v.surahNo === surahNumber)) {
				// Reset and load the selected surah
				loadedSurahRange = { start: surahNumber, end: surahNumber };
				fetchAllVerses(surahNumber, false).then(() => {
					// Scroll to the selected verse after loading
					setTimeout(() => {
						const targetElement = document.querySelector(`[data-ayah="${ayahNumber}"][data-surah="${surahNumber}"]`);
						if (targetElement && verseContainer) {
							targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
						}
					}, 200);
				});
			} else {
				// Surah already loaded, just scroll to the verse
				setTimeout(() => {
					const targetElement = document.querySelector(`[data-ayah="${ayahNumber}"][data-surah="${surahNumber}"]`);
					if (targetElement && verseContainer) {
						targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
					}
				}, 100);
			}
		}
		stopAudio();
		
		// Close sidebar on mobile after selection
		if (isMobile) {
			sidebarOpen = false;
		}
	}

	function selectSurah(surahNumber: number) {
		const wasChapterChange = currentSurah !== surahNumber;
		currentSurah = surahNumber;
		currentAyah = 1;
		
		// Reset visible range when changing surah
		if (wasChapterChange) {
			visibleVerseRange = { start: 1, end: 1 };
			visibleVerses = new Set([1]);
			visibleElements.clear(); // Clear the visibility tracking map
		}
		
		saveProgress();
		saveCurrentPosition(); // Save to localStorage
		
		if (currentView === 'verse') {
			if (wasChapterChange) {
				isChapterLoaded = false;
				currentChapterVerses = [];
				preloadCurrentChapter();
			}
		} else {
			// In list view, reset and load the selected surah
			loadedSurahRange = { start: surahNumber, end: surahNumber };
			fetchAllVerses(surahNumber, false);
		}
		stopAudio();
		
		// Close sidebar on mobile after selection
		if (isMobile) {
			sidebarOpen = false;
		}
	}

	function toggleView() {
		const previousView = currentView;
		const previousScrollPosition = verseContainer?.scrollTop || 0;
		
		currentView = currentView === 'list' ? 'verse' : 'list';
		
		// Store the current scroll position and ayah for switching back
		if (previousView === 'list') {
			// Store where we were in list view
			setCookie('quran_list_scroll_position', previousScrollPosition.toString());
		}
		
		// Reset visibility tracking when switching to verse view
		if (currentView === 'verse') {
			visibleVerses = new Set();
			visibleVerseRange = { start: currentAyah, end: currentAyah };
			visibleElements.clear();
		}
		
		saveProgress();
		
		if (currentView === 'verse') {
			if (!isChapterLoaded) {
				preloadCurrentChapter();
			} else {
				fetchCurrentVerse();
			}
		} else {
			// When switching to list view, try to maintain position
			fetchAllVerses(currentSurah).then(() => {
				// Try to restore scroll position
				const savedScrollPosition = getCookie('quran_list_scroll_position');
				if (savedScrollPosition && verseContainer) {
					setTimeout(() => {
						verseContainer.scrollTop = parseInt(savedScrollPosition);
					}, 100);
				} else {
					// Scroll to current ayah if no saved position
					setTimeout(() => {
						const currentVerseElement = document.querySelector(`[data-ayah="${currentAyah}"][data-surah="${currentSurah}"]`);
						if (currentVerseElement && verseContainer) {
							currentVerseElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
						}
					}, 200);
				}
			});
		}
	}

	async function nextVerse() {
		const now = Date.now();
		if (isTransitioning || (now - lastNavigationTime) < 300) return;
		lastNavigationTime = now;
		
		const currentSurahData = surahs.find(s => s.surahNumber === currentSurah);
		if (!currentSurahData) return;

		const wasLastVerse = currentAyah === currentSurahData.totalAyah;
		const willChangeChapter = wasLastVerse && currentSurah < 114;

		if (willChangeChapter) {
			// Show chapter transition
			const nextSurahNumber = currentSurah + 1;
			await showChapterTransitionScreen('next', nextSurahNumber);
			currentSurah++;
			currentAyah = 1;
			isChapterLoaded = false;
			currentChapterVerses = [];
		} else if (currentAyah < currentSurahData.totalAyah) {
			currentAyah++;
		}
		
		saveProgress();
		saveCurrentPosition(); // Save to localStorage
		if (currentView === 'verse') {
			if (willChangeChapter) {
				await preloadCurrentChapter();
			} else {
				await fetchCurrentVerse();
			}
		}
		stopAudio();
	}

	async function prevVerse() {
		const now = Date.now();
		if (isTransitioning || (now - lastNavigationTime) < 300) return;
		lastNavigationTime = now;
		
		const wasFirstVerse = currentAyah === 1;
		const willChangeChapter = wasFirstVerse && currentSurah > 1;

		if (willChangeChapter) {
			// Show chapter transition
			const prevSurahNumber = currentSurah - 1;
			await showChapterTransitionScreen('prev', prevSurahNumber);
			currentSurah--;
			const prevSurahData = surahs.find(s => s.surahNumber === currentSurah);
			currentAyah = prevSurahData ? prevSurahData.totalAyah : 1;
			isChapterLoaded = false;
			currentChapterVerses = [];
		} else if (currentAyah > 1) {
			currentAyah--;
		}
		
		saveProgress();
		saveCurrentPosition(); // Save to localStorage
		if (currentView === 'verse') {
			if (willChangeChapter) {
				await preloadCurrentChapter();
			} else {
				await fetchCurrentVerse();
			}
		}
		stopAudio();
	}

	// Show chapter transition screen
	async function showChapterTransitionScreen(direction: 'next' | 'prev', newSurahNumber: number) {
		isTransitioning = true;
		transitionDirection = direction;
		transitionSurahNumber = newSurahNumber;
		showChapterTransition = true;
		
		// Wait for transition animation
		await new Promise(resolve => setTimeout(resolve, 1500));
		
		showChapterTransition = false;
		isTransitioning = false;
	}
	
	// Setup intersection observer for automatic ayah tracking - split into two observers
	let lastCurrentAyahUpdate = 0;
	let visibilityObserver: IntersectionObserver;
	let visibleElements = new Map<string, { surah: number, ayah: number, ratio: number }>();
	
	function setupIntersectionObserver() {
		if (!browser) return;
		
		// Fast observer for visible range tracking - updates immediately
		visibilityObserver = new IntersectionObserver(
			(entries) => {
				// Update the map of currently visible elements
				entries.forEach(entry => {
					const ayahNumber = parseInt(entry.target.getAttribute('data-ayah') || '0');
					const surahNumber = parseInt(entry.target.getAttribute('data-surah') || '0');
					const key = `${surahNumber}-${ayahNumber}`;
					
					if (entry.isIntersecting && entry.intersectionRatio > 0.1) {
						visibleElements.set(key, { 
							surah: surahNumber, 
							ayah: ayahNumber, 
							ratio: entry.intersectionRatio 
						});
					} else {
						visibleElements.delete(key);
					}
				});
				
				// Update visible verse range for all surahs
				const allVisibleVerses = Array.from(visibleElements.values());
				if (allVisibleVerses.length > 0) {
					// Group by surah
					const visibleBySurah = new Map<number, number[]>();
					allVisibleVerses.forEach(v => {
						if (!visibleBySurah.has(v.surah)) {
							visibleBySurah.set(v.surah, []);
						}
						visibleBySurah.get(v.surah)!.push(v.ayah);
					});
					
					// Update for current surah
					const currentSurahVisible = visibleBySurah.get(currentSurah) || [];
					if (currentSurahVisible.length > 0) {
						currentSurahVisible.sort((a, b) => a - b);
						const newRange = {
							start: currentSurahVisible[0],
							end: currentSurahVisible[currentSurahVisible.length - 1]
						};
						const newVisibleSet = new Set(currentSurahVisible);
						
						// Only update if there's actually a change
						if (newRange.start !== visibleVerseRange.start || 
							newRange.end !== visibleVerseRange.end ||
							newVisibleSet.size !== visibleVerses.size) {
							visibleVerseRange = newRange;
							visibleVerses = newVisibleSet;
						}
					}
					
					// Check if we've scrolled to a different surah and update accordingly
					const mostVisibleSurah = Array.from(visibleBySurah.entries())
						.reduce((prev, current) => {
							return current[1].length > prev[1].length ? current : prev;
						});
					
					if (mostVisibleSurah && mostVisibleSurah[0] !== currentSurah && mostVisibleSurah[1].length > 2) {
						// Update current surah if we've clearly scrolled to a different one
						currentSurah = mostVisibleSurah[0];
						currentAyah = Math.min(...mostVisibleSurah[1]);
						saveProgress();
					}
				} else if (currentView === 'list') {
					// Clear visible verses if none are visible for current surah
					visibleVerses = new Set();
					visibleVerseRange = { start: currentAyah, end: currentAyah };
				}
			},
			{
				root: verseContainer,
				rootMargin: '-5% 0px -5% 0px',
				threshold: [0.1, 0.3, 0.5, 0.7, 0.9]
			}
		);
		
		// Faster observer for current ayah tracking - reduced throttling
		intersectionObserver = new IntersectionObserver(
			(entries) => {
				const now = Date.now();
				// Reduced throttle time for faster response
				if (now - lastCurrentAyahUpdate < 800) return;
				
				let bestMatch: { surah: number; ayah: number } | null = null;
				let bestRatio = 0;
				
				entries.forEach(entry => {
					const ayahNumber = parseInt(entry.target.getAttribute('data-ayah') || '0');
					const surahNumber = parseInt(entry.target.getAttribute('data-surah') || '0');
					
					// Consider entries that are significantly visible
					if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
						if (entry.intersectionRatio > bestRatio) {
							bestMatch = { surah: surahNumber, ayah: ayahNumber };
							bestRatio = entry.intersectionRatio;
						}
					}
				});
				
				// Update if we found a good match
				if (bestMatch !== null) {
					const match = bestMatch as { surah: number; ayah: number };
					const matchedSurah = match.surah;
					const matchedAyah = match.ayah;
					const wasChapterChange = currentSurah !== matchedSurah;
					const wasAyahChange = currentAyah !== matchedAyah;
					
					if (wasChapterChange || wasAyahChange) {
						currentSurah = matchedSurah;
						currentAyah = matchedAyah;
						
						// Update currentVerseData for audio controls if in list view
						if (currentView === 'list') {
							const verseData = allVerses.find(v => v.surahNo === matchedSurah && v.ayahNo === matchedAyah);
							if (verseData) {
								currentVerseData = verseData;
							}
						}
						
						saveProgress();
						saveCurrentPosition(); // Save current position to localStorage
						lastCurrentAyahUpdate = now;
					}
				}
			},
			{
				root: verseContainer,
				rootMargin: '-15% 0px -15% 0px', // Slightly more conservative
				threshold: [0.5, 0.7, 0.9] // Higher thresholds for more accurate detection
			}
		);
	}
	
	// Auto-load next surah when reaching the end in list view - much more conservative
	async function autoLoadNextSurah() {
		const nextSurahNumber = loadedSurahRange.end + 1;
		if (nextSurahNumber > 114 || loadingSurahs.has(nextSurahNumber)) return;
		
		// Only load if we're actually near the end and scrolling down
		if (verseContainer) {
			const scrollPercent = (verseContainer.scrollTop + verseContainer.clientHeight) / verseContainer.scrollHeight;
			if (scrollPercent < 0.95) return; // Wait until 95% scrolled
		}
		
		// Add a delay to prevent immediate loading
		setTimeout(async () => {
			if (verseContainer) {
				const scrollPercent = (verseContainer.scrollTop + verseContainer.clientHeight) / verseContainer.scrollHeight;
				if (scrollPercent >= 0.95) {
					await fetchAllVerses(nextSurahNumber, true);
				}
			}
		}, 1000);
	}
	
	// Auto-load previous surah when reaching the beginning in list view - much more conservative
	async function autoLoadPrevSurah() {
		const prevSurahNumber = loadedSurahRange.start - 1;
		if (prevSurahNumber < 1 || loadingSurahs.has(prevSurahNumber)) return;
		
		// Only load if we're actually near the beginning and scrolling up
		if (verseContainer) {
			const scrollPercent = verseContainer.scrollTop / verseContainer.scrollHeight;
			if (scrollPercent > 0.05) return; // Wait until top 5%
		}
		
		const surahData = surahs.find(s => s.surahNumber === prevSurahNumber);
		if (!surahData) return;
		
		// Add a delay to prevent immediate loading
		setTimeout(async () => {
			if (verseContainer) {
				const scrollPercent = verseContainer.scrollTop / verseContainer.scrollHeight;
				if (scrollPercent <= 0.05) {
					await loadPreviousSurahContent(prevSurahNumber, surahData);
				}
			}
		}, 1000);
	}
	
	async function loadPreviousSurahContent(prevSurahNumber: number, surahData: any) {
		loadingSurahs.add(prevSurahNumber);
		
		try {
			// Fetch previous surah verses
			const verses = [];
			const batchSize = 10;
			for (let i = 1; i <= surahData.totalAyah; i += batchSize) {
				const batchPromises = [];
				for (let j = i; j < Math.min(i + batchSize, surahData.totalAyah + 1); j++) {
					batchPromises.push(
						fetch(`https://quranapi.pages.dev/api/${prevSurahNumber}/${j}.json`)
							.then(response => response.json())
					);
				}
				const batchResults = await Promise.all(batchPromises);
				verses.push(...batchResults);
			}
			
			// Store current scroll position
			const currentScrollTop = verseContainer?.scrollTop || 0;
			const currentScrollHeight = verseContainer?.scrollHeight || 0;
			
			// Prepend to current verses
			allVerses = [...verses, ...allVerses];
			loadedSurahRange.start = prevSurahNumber;
			
			// Restore scroll position accounting for new content
			if (verseContainer) {
				setTimeout(() => {
					const newScrollHeight = verseContainer.scrollHeight;
					const heightDifference = newScrollHeight - currentScrollHeight;
					verseContainer.scrollTop = currentScrollTop + heightDifference;
				}, 100);
			}
			
			loadingSurahs.delete(prevSurahNumber);
		} catch (error) {
			console.error('Error auto-loading previous surah:', error);
			loadingSurahs.delete(prevSurahNumber);
		}
	}

	function playAudio() {
		if (!currentVerseData?.audio?.[currentReciter]?.url) return;
		
		if (currentAudio) {
			currentAudio.pause();
		}
		
		currentAudio = new Audio(currentVerseData.audio[currentReciter].url);
		currentAudio.play();
		isPlaying = true;
		
		currentAudio.onended = () => {
			isPlaying = false;
		};
		
		currentAudio.onerror = () => {
			console.error('Error playing audio');
			isPlaying = false;
		};
	}

	function stopAudio() {
		if (currentAudio) {
			currentAudio.pause();
			currentAudio = null;
		}
		isPlaying = false;
	}

	function toggleAudio() {
		if (isPlaying) {
			stopAudio();
		} else {
			playAudio();
		}
	}

	function changeLanguage(lang: string) {
		selectedLanguage = lang;
		saveProgress();
	}

	function changeReciter(reciterId: number) {
		currentReciter = reciterId;
		saveProgress();
		stopAudio();
	}

	// Mobile and sidebar state
	let isMobile = false;
	let sidebarOpen = false;
	let settingsOpen = false;
	let touchStartY = 0;
	let touchEndY = 0;
	let verseContainer: HTMLElement;
	
	// Scroll handling for PC
	let isScrolling = false;
	let scrollTimeout: NodeJS.Timeout;

	// Check if mobile/tablet orientation
	function checkMobile() {
		if (browser) {
			const width = window.innerWidth;
			const height = window.innerHeight;
			const isPortrait = height > width;
			
			// Mobile: < 768px width OR tablet in portrait mode
			// Desktop: >= 768px width AND tablet in landscape mode
			isMobile = width < 768 || (width >= 768 && width <= 1024 && isPortrait);
			
			if (!isMobile) {
				sidebarOpen = false; // Close sidebar on desktop
				settingsOpen = false; // Close settings on desktop
			}
		}
	}

	// Handle wheel scroll in verse container for PC navigation
	function handleWheel(e: WheelEvent) {
		if (currentView !== 'verse' || isMobile) return; // Only handle wheel scroll in verse view on PC
		
		e.preventDefault();
		
		// Prevent rapid scrolling
		if (isScrolling) return;
		
		isScrolling = true;
		clearTimeout(scrollTimeout);
		
		// Determine scroll direction and navigate
		if (e.deltaY > 0) {
			// Scroll down - next verse
			nextVerse();
		} else {
			// Scroll up - previous verse
			prevVerse();
		}
		
		// Reset scrolling flag after a delay
		scrollTimeout = setTimeout(() => {
			isScrolling = false;
		}, 300);
	}

	function toggleSettings() {
		settingsOpen = !settingsOpen;
	}

	// Touch/swipe handlers
	function handleTouchStart(e: TouchEvent) {
		touchStartY = e.touches[0].clientY;
	}

	function handleTouchEnd(e: TouchEvent) {
		if (currentView !== 'verse') return; // Only handle swipes in verse view
		
		touchEndY = e.changedTouches[0].clientY;
		const swipeDistance = touchStartY - touchEndY;
		const minSwipeDistance = 50;

		if (Math.abs(swipeDistance) > minSwipeDistance) {
			if (swipeDistance > 0) {
				// Swipe up - next verse
				nextVerse();
			} else {
				// Swipe down - previous verse
				prevVerse();
			}
		}
	}

	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
		
		// Prevent body scroll on mobile when sidebar is open
		if (browser && isMobile) {
			if (sidebarOpen) {
				document.body.style.overflow = 'hidden';
			} else {
				document.body.style.overflow = '';
			}
		}
	}

	function scrollToNextVerse() {
		nextVerse();
	}

	function scrollToPrevVerse() {
		prevVerse();
	}

	// Keyboard navigation
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
			event.preventDefault();
			nextVerse();
		} else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
			event.preventDefault();
			prevVerse();
		} else if (event.key === ' ') {
			event.preventDefault();
			toggleAudio();
		}
	}

	onMount(() => {
		loadProgress();
		checkMobile();
		setupIntersectionObserver();
		
		fetchSurahs().then(() => {
			if (currentView === 'verse') {
				preloadCurrentChapter();
			} else {
				fetchAllVerses(currentSurah);
			}
		}).finally(() => {
			isLoading = false;
		});
		
		// Add keyboard event listener
		if (browser) {
			window.addEventListener('keydown', handleKeydown);
			window.addEventListener('resize', checkMobile);
		}
		
		return () => {
			if (browser) {
				window.removeEventListener('keydown', handleKeydown);
				window.removeEventListener('resize', checkMobile);
				if (intersectionObserver) {
					intersectionObserver.disconnect();
				}
				if (visibilityObserver) {
					visibilityObserver.disconnect();
				}
				// Clear the visible elements map
				visibleElements.clear();
				// Clean up body overflow style
				document.body.style.overflow = '';
			}
		};
	});
	
	// Svelte action for verse intersection observer - register with both observers
	function setupVerseObserver(node: HTMLElement) {
		if (currentView === 'list') {
			// Register with both observers for different purposes
			setTimeout(() => {
				if (visibilityObserver) {
					visibilityObserver.observe(node);
				}
				if (intersectionObserver) {
					intersectionObserver.observe(node);
				}
			}, 50); // Reduced delay for faster registration
		}
		
		return {
			destroy() {
				if (visibilityObserver) {
					visibilityObserver.unobserve(node);
				}
				if (intersectionObserver) {
					intersectionObserver.unobserve(node);
				}
			}
		};
	}
	
	// Svelte action for auto-load trigger - less aggressive
	function setupAutoLoadTrigger(node: HTMLElement, options: { direction: 'next' | 'prev' }) {
		let autoLoadObserver: IntersectionObserver;
		
		if (browser) {
			autoLoadObserver = new IntersectionObserver(
				(entries) => {
					entries.forEach(entry => {
						if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
							// Add delay to prevent rapid loading
							setTimeout(() => {
								if (options.direction === 'next') {
									autoLoadNextSurah();
								} else {
									autoLoadPrevSurah();
								}
							}, 500);
						}
					});
				},
				{
					root: verseContainer,
					rootMargin: '100px', // Reduced from 200px
					threshold: 0.5 // Increased from 0.1
				}
			);
			
			autoLoadObserver.observe(node);
		}
		
		return {
			destroy() {
				if (autoLoadObserver) {
					autoLoadObserver.disconnect();
				}
			}
		};
	}
</script>

<div class="h-screen bg-british-racing-green text-white flex flex-col overflow-hidden">
	{#if isLoading}
		<div class="flex items-center justify-center h-full">
			<div class="text-white/50">Loading...</div>
		</div>
	{:else}
		<!-- Mobile Header -->
		{#if isMobile}
			<div class="bg-black/20 border-b border-white/20 p-4 flex items-center justify-between relative z-30">
				<button
					on:click={toggleSidebar}
					class="p-2 bg-white/10 hover:bg-white/20 rounded transition-all touch-button flex items-center justify-center"
					aria-label="Toggle sidebar"
				>
					<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
						<path fill-rule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"></path>
					</svg>
				</button>
				<div class="text-center">
					<h1 class="font-chivo-mono text-sm text-white">
						{#if currentVerseData}
							{currentVerseData.surahName} • {currentVerseData.ayahNo}
						{:else}
							Quran Reader
						{/if}
					</h1>
				</div>
				<button
					on:click={toggleSettings}
					class="p-2 bg-white/10 hover:bg-white/20 rounded transition-all touch-button flex items-center justify-center"
					aria-label="Open settings"
				>
					<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
						<path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"></path>
					</svg>
				</button>
			</div>
		{/if}

		<!-- Mobile Settings Modal -->
		{#if isMobile && settingsOpen}
			<div class="fixed inset-0 bg-black/50 z-50 flex items-end">
				<div class="w-full bg-british-racing-green border-t border-white/20 p-6 space-y-6">
					<div class="flex justify-between items-center mb-6">
						<h2 class="font-chivo-mono text-lg text-white">Settings</h2>
						<button
							on:click={toggleSettings}
							class="p-2 text-white/50 hover:text-white transition-colors"
							aria-label="Close settings"
						>
							<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
							</svg>
						</button>
					</div>
					
					<div>
						<label for="mobile-language-select" class="block text-white/70 font-chivo-mono text-sm mb-2">Language</label>
						<select
							id="mobile-language-select"
							bind:value={selectedLanguage}
							on:change={() => changeLanguage(selectedLanguage)}
							class="w-full bg-white/10 text-white border border-white/20 rounded-lg px-4 py-3 text-base font-chivo-mono"
						>
							{#each languages as lang}
								<option value={lang.key} class="bg-british-racing-green text-white">{lang.name}</option>
							{/each}
						</select>
					</div>

					<div>
						<label for="mobile-reciter-select" class="block text-white/70 font-chivo-mono text-sm mb-2">Reciter</label>
						<select
							id="mobile-reciter-select"
							bind:value={currentReciter}
							on:change={() => changeReciter(currentReciter)}
							class="w-full bg-white/10 text-white border border-white/20 rounded-lg px-4 py-3 text-base font-chivo-mono"
						>
							{#each reciters as reciter}
								<option value={reciter.id} class="bg-british-racing-green text-white">{reciter.name}</option>
							{/each}
						</select>
					</div>
				</div>
			</div>
		{/if}

		<!-- Mobile Sidebar (Fixed Position) -->
		{#if isMobile}
			<div class={`
				fixed inset-0 z-50 mobile-sidebar-overlay transform transition-transform duration-300
				${!sidebarOpen ? '-translate-x-full' : 'translate-x-0'}
			`}>
				<!-- Main sidebar container - Full screen on mobile -->
				<div class="mobile-sidebar-container w-full h-full bg-british-racing-green flex flex-col">
					<!-- Mobile sidebar header with close button -->
					<div class="mobile-sidebar-header p-4 border-b border-white/20 flex justify-between items-center">
						<h2 class="font-chivo-mono text-lg text-white">Quran Navigation</h2>
						<button
							on:click={toggleSidebar}
							class="p-2 text-white/50 hover:text-white transition-colors touch-button"
							aria-label="Close sidebar"
						>
							<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
							</svg>
						</button>
					</div>

					<!-- Mobile view toggle -->
					<div class="mobile-view-toggle p-4 border-b border-white/20">
						<div class="mobile-toggle-container relative bg-white/10 rounded-lg p-1 flex">
							<!-- Sliding background indicator for mobile -->
							<div 
								class="mobile-toggle-slider absolute top-1 bottom-1 bg-white/20 rounded-md transition-all duration-300 ease-in-out" 
								style="width: calc(50% - 4px); left: {currentView === 'list' ? '4px' : 'calc(50%)'};"
							></div>
							<!-- Toggle buttons -->
							<button
								on:click={toggleView}
								class="mobile-toggle-button relative z-10 flex-1 py-3 text-center rounded-md font-chivo-mono text-sm font-medium transition-colors duration-300 touch-button {
									currentView === 'list' 
										? 'text-white' 
										: 'text-white/60'
								}"
							>
								LIST
							</button>
							<button
								on:click={toggleView}
								class="mobile-toggle-button relative z-10 flex-1 py-3 text-center rounded-md font-chivo-mono text-sm font-medium transition-colors duration-300 touch-button {
									currentView === 'verse' 
										? 'text-white' 
										: 'text-white/60'
								}"
							>
								VERSE
							</button>
						</div>
					</div>
					
					<!-- Mobile content container -->
					<div class="mobile-content-container flex-1 flex flex-row min-h-0">
						<!-- Surah Numbers Column -->
						<div class="mobile-surah-numbers w-20 border-r border-white/20 overflow-y-auto">
							<div class="p-2">
								<h3 class="text-xs font-chivo-mono text-white/50 mb-2 text-center">SURAH</h3>
								<div class="space-y-1">
									{#each surahs as surah}
										<button
											on:click={() => selectSurah(surah.surahNumber)}
											class={`w-full text-center py-3 px-1 rounded font-chivo-mono text-xs transition-all touch-button ${
												currentSurah === surah.surahNumber 
													? 'bg-white/20 text-white opacity-100' 
													: 'hover:bg-white/10 text-white/50 opacity-50'
											}`}
										>
											{surah.surahNumber}
										</button>
									{/each}
								</div>
							</div>
						</div>

						<!-- Main content area -->
						<div class="mobile-main-content flex-1 overflow-y-auto">
							<div class="p-4">
								<!-- Current Surah Info -->
								<div class="mobile-surah-info mb-6">
									<h3 class="text-xs font-chivo-mono text-white/50 mb-2">CURRENT SURAH</h3>
									{#if surahs.find(s => s.surahNumber === currentSurah)}
										{@const surah = surahs.find(s => s.surahNumber === currentSurah)}
										<div class="mb-4">
											<h2 class="font-chivo-mono text-base text-white mb-1">{surah.surahName}</h2>
											<p class="text-sm text-white/50 font-chivo-mono" dir="rtl">{surah.surahNameArabic}</p>
											<p class="text-xs text-white/50 font-chivo-mono">{surah.totalAyah} verses</p>
										</div>
									{/if}
								</div>

								<!-- Mobile Audio Controls -->
								{#if currentVerseData}
									<div class="mobile-audio-controls mb-6 p-4 bg-white/5 rounded-lg">
										<h3 class="text-xs font-chivo-mono text-white/50 mb-3">AUDIO CONTROLS</h3>
										<div class="space-y-3">
											<button
												on:click={toggleAudio}
												class="w-full px-4 py-3 bg-white/10 hover:bg-white/20 rounded-lg transition-all font-chivo-mono text-sm text-white disabled:opacity-30 touch-button"
												disabled={!currentVerseData?.audio?.[currentReciter]?.url}
											>
												{isPlaying ? '⏸ PAUSE AUDIO' : '▶ PLAY AUDIO'}
											</button>
										</div>
									</div>
								{/if}

								<!-- Ayah Grid -->
								<div class="mobile-ayah-grid">
									<div class="flex items-center justify-between mb-3">
										<h3 class="text-xs font-chivo-mono text-white/50">AYAH SELECTION</h3>
										{#if currentView === 'list' && visibleVerses.size > 0}
											<div class="text-xs font-chivo-mono text-white/40">
												{visibleVerseRange.start === visibleVerseRange.end 
													? `${visibleVerseRange.start}` 
													: `${visibleVerseRange.start}-${visibleVerseRange.end}`} visible
											</div>
										{/if}
									</div>
									<div class="grid grid-cols-6 gap-2">
										{#if surahs.find(s => s.surahNumber === currentSurah)}
											{@const surah = surahs.find(s => s.surahNumber === currentSurah)}
											{#each Array(surah.totalAyah) as _, index}
												{@const ayahNumber = index + 1}
												<button
													on:click={() => selectVerse(currentSurah, ayahNumber)}
													class={`py-3 px-2 text-center rounded font-chivo-mono text-xs transition-all touch-button ${
														currentAyah === ayahNumber 
															? 'bg-white/20 text-white opacity-100' 
															: visibleVerses.has(ayahNumber) 
																? 'bg-white/10 text-white/80 opacity-80 ring-1 ring-white/20' 
																: 'hover:bg-white/10 text-white/50 opacity-50'
													}`}
												>
													{ayahNumber}
												</button>
											{/each}
										{/if}
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}

		<!-- Main Content -->
		<div class="flex-1 flex relative min-h-0">		
            <!-- Left Sidebar - Surah and Ayah Selection (Desktop only in flex) -->
		{#if !isMobile}
			<div class="sidebar-container bg-black/20 border-r border-white/20 flex flex-row relative h-full">
				<!-- Sidebar shadows -->
				<div class="sidebar-shadow sidebar-shadow-top"></div>
				<div class="sidebar-shadow sidebar-shadow-bottom"></div>
				<!-- Surah Numbers -->
				<div class="sidebar-numbers border-r border-white/20 overflow-y-auto sidebar-content">
					<div class="p-2">
						<h3 class="text-xs font-chivo-mono text-white/50 mb-2 text-center">SURAH</h3>
						<div class="space-y-1">
							{#each surahs as surah}
								<button
									on:click={() => selectSurah(surah.surahNumber)}
									class={`w-full text-center py-2 px-2 rounded font-chivo-mono text-xs transition-all ${
										currentSurah === surah.surahNumber 
											? 'bg-white/20 text-white opacity-100' 
											: 'hover:bg-white/10 text-white/50 opacity-50'
									}`}
								>
									{surah.surahNumber}
								</button>
							{/each}
						</div>
					</div>
				</div>

				<!-- Surah Names and Ayah Numbers -->
				<div class="flex-1 overflow-y-auto sidebar-content">
					<div class="p-6">
						<div class="mb-6">
							<h3 class="text-xs font-chivo-mono text-white/50 mb-3">SURAH</h3>
							{#if surahs.find(s => s.surahNumber === currentSurah)}
								{@const surah = surahs.find(s => s.surahNumber === currentSurah)}
								<div class="mb-6">
									<h2 class="font-chivo-mono text-base text-white mb-2">{surah.surahName}</h2>
									<p class="text-sm text-white/50 font-chivo-mono" dir="rtl">{surah.surahNameArabic}</p>
									<p class="text-xs text-white/50 font-chivo-mono">{surah.totalAyah} verses</p>
								</div>
							{/if}
						</div>

						<div>
							<div class="flex items-center justify-between mb-3">
								<h3 class="text-xs font-chivo-mono text-white/50">AYAH</h3>
								{#if currentView === 'list' && visibleVerses.size > 0}
									<div class="text-xs font-chivo-mono text-white/40">
										{visibleVerseRange.start === visibleVerseRange.end 
											? `${visibleVerseRange.start}` 
											: `${visibleVerseRange.start}-${visibleVerseRange.end}`} visible
									</div>
								{/if}
							</div>
							<div class="grid grid-cols-6 gap-2">
								{#if surahs.find(s => s.surahNumber === currentSurah)}
									{@const surah = surahs.find(s => s.surahNumber === currentSurah)}
									{#each Array(surah.totalAyah) as _, index}
										{@const ayahNumber = index + 1}
										<button
											on:click={() => selectVerse(currentSurah, ayahNumber)}
											class={`text-center py-2 px-2 rounded font-chivo-mono text-xs transition-all ${
												currentSurah === currentSurah && currentAyah === ayahNumber
													? 'bg-white/20 text-white opacity-100' 
													: visibleVerses.has(ayahNumber) 
														? 'bg-white/10 text-white/80 opacity-80 ring-1 ring-white/20' 
														: 'hover:bg-white/10 text-white/50 opacity-50'
											}`}
										>
											{ayahNumber}
										</button>
									{/each}
								{/if}
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}
		
		<!-- Mobile Sidebar Overlay -->
		{#if isMobile && sidebarOpen}
			<div 
				class="fixed inset-0 bg-black/70 z-40"
				on:click={toggleSidebar}
				on:keydown={(e) => e.key === 'Escape' && toggleSidebar()}
				role="button"
				tabindex="0"
				aria-label="Close sidebar"
			></div>
		{/if}

			<!-- Right Content - Current Verse Display -->
			<div class="flex-1 flex flex-col min-h-0">
				<!-- View Toggle Header (Desktop only) -->
				{#if !isMobile}
					<div class="header-container border-b border-white/20 flex items-center justify-between">
						<div class="flex items-center gap-4">
							<div class="toggle-container relative bg-white/10 rounded-lg p-1">
								<!-- Sliding background indicator -->
								<div 
									class="toggle-slider absolute top-1 bottom-1 bg-white/20 rounded-md transition-all duration-300 ease-in-out" 
									style="width: calc(50% - 4px); left: {currentView === 'list' ? '4px' : 'calc(50%)'};"
								></div>
								<!-- Toggle buttons in flex container -->
								<div class="flex">
									<button
										on:click={toggleView}
										class="toggle-button relative z-10 flex-1 py-2 px-4 rounded-md font-chivo-mono text-sm font-medium transition-colors duration-300 {
											currentView === 'list' 
												? 'text-white' 
												: 'text-white/60 hover:text-white/80'
										}"
									>
										LIST
									</button>
									<button
										on:click={toggleView}
										class="toggle-button relative z-10 flex-1 py-2 px-4 rounded-md font-chivo-mono text-sm font-medium transition-colors duration-300 {
											currentView === 'verse' 
												? 'text-white' 
												: 'text-white/60 hover:text-white/80'
										}"
									>
										VERSE
									</button>
								</div>
							</div>

							<!-- Tafseer Author Selector -->
							<div class="flex items-center gap-2">
								<span class="text-xs font-chivo-mono text-white/50">TAFSEER</span>
								<select
									bind:value={selectedTafseerAuthor}
									on:change={() => saveProgress()}
									class="control-select bg-white/10 text-white border border-white/20 rounded-lg px-3 py-2 text-sm font-chivo-mono opacity-80 hover:opacity-100 transition-opacity"
								>
									{#each tafseerAuthors as author}
										<option value={author} class="bg-british-racing-green text-white">{author}</option>
									{/each}
								</select>
							</div>
						</div>
						
						<div class="header-content flex items-center gap-6">
							<!-- Audio and Settings Controls -->
							<div class="controls-container flex items-center space-x-4">
								<!-- Language Selector -->
								<select
									bind:value={selectedLanguage}
									on:change={() => changeLanguage(selectedLanguage)}
									class="control-select bg-white/10 text-white border border-white/20 rounded-lg px-3 py-2 text-sm font-chivo-mono opacity-80 hover:opacity-100 transition-opacity"
								>
									{#each languages as lang}
										<option value={lang.key} class="bg-british-racing-green text-white">{lang.name}</option>
									{/each}
								</select>

								<!-- Reciter Selector -->
								<select
									bind:value={currentReciter}
									on:change={() => changeReciter(currentReciter)}
									class="control-select bg-white/10 text-white border border-white/20 rounded-lg px-3 py-2 text-sm font-chivo-mono opacity-80 hover:opacity-100 transition-opacity"
								>
									{#each reciters as reciter}
										<option value={reciter.id} class="bg-british-racing-green text-white">{reciter.name}</option>
									{/each}
								</select>

								<!-- Play Button -->
								<button
									on:click={toggleAudio}
									class="play-button px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all font-chivo-mono text-sm text-white disabled:opacity-30"
									disabled={!currentVerseData?.audio?.[currentReciter]?.url}
								>
									{isPlaying ? '⏸ PAUSE' : '▶ PLAY'}
								</button>
							</div>

							<!-- Current Position -->
							<div class="position-indicator">
								{#if currentVerseData}
									<h1 class="font-chivo-mono text-sm text-white font-medium">
										{currentVerseData.surahName} • {currentVerseData.ayahNo}
									</h1>
								{:else}
									<!-- Fallback display while loading -->
									{@const currentSurahInfo = surahs.find(s => s.surahNumber === currentSurah)}
									<h1 class="font-chivo-mono text-sm text-white/60 font-medium">
										{currentSurahInfo ? currentSurahInfo.surahName : 'Loading...'} • {currentAyah}
									</h1>
								{/if}
							</div>
						</div>
					</div>
				{/if}

                <!-- Verse Display -->
                <div 
					class={`flex-1 overflow-y-auto verse-container relative ${currentView === 'verse' && !isMobile ? 'verse-view' : ''}`}
					bind:this={verseContainer} 
					on:touchstart={handleTouchStart}
					on:touchend={handleTouchEnd}
					on:wheel={handleWheel}
				>
					<!-- Top shadow -->
					<div class="scroll-shadow scroll-shadow-top"></div>
					
					<!-- Bottom shadow -->
					<div class="scroll-shadow scroll-shadow-bottom"></div>
					{#if showChapterTransition}
						{@const surahInfo = surahs.find(s => s.surahNumber === transitionSurahNumber)}
						<!-- Chapter Transition Screen -->
						<div class="min-h-full min-w-full flex items-center justify-center p-4 md:p-8 chapter-transition">
							{#if surahInfo}
								<div class="text-center space-y-4 chapter-info">
									<div class="chapter-number font-chivo-mono text-6xl md:text-8xl text-white/20 font-bold">
										{surahInfo.surahNumber}
									</div>
									<div class="space-y-2">
										<h2 class="font-chivo-mono text-xl md:text-2xl text-white">
											SURAH {surahInfo.surahNumber}
										</h2>
										<h3 class="font-onest text-2xl md:text-3xl text-white">
											{surahInfo.surahName}
										</h3>
										<p class="font-amiri text-3xl md:text-4xl text-white/80" dir="rtl">
											{surahInfo.surahNameArabic}
										</p>
										<p class="font-chivo-mono text-sm text-white/50">
											{surahInfo.totalAyah} verses
										</p>
									</div>
								</div>
							{/if}
						</div>
					{:else if contentLoading}
						<!-- Skeleton Loading -->
						<div class="min-h-full min-w-full flex items-center justify-end p-4 md:p-8 animate-pulse">
							{#if currentView === 'verse'}
								<!-- Skeleton for verse view -->
								<div class="max-w-4xl w-full text-right space-y-6 p-4 md:p-8">
									<!-- Arabic text skeleton -->
									<div class="space-y-3" dir="rtl">
										<div class="h-8 md:h-12 bg-white/10 rounded-lg ml-auto w-5/6"></div>
										<div class="h-8 md:h-12 bg-white/10 rounded-lg ml-auto w-4/6"></div>
										<div class="h-8 md:h-12 bg-white/10 rounded-lg ml-auto w-3/6"></div>
									</div>
									
									<!-- Translation skeleton -->
									<div class="space-y-2 mt-8">
										<div class="h-6 bg-white/5 rounded-lg ml-auto w-4/5"></div>
										<div class="h-6 bg-white/5 rounded-lg ml-auto w-3/5"></div>
									</div>
								</div>
							{:else}
                                <!-- Skeleton for list view -->
                                <div class="p-4 md:p-8 space-y-8">
                                    {#each Array(5) as _}
                                        <div class="max-w-4xl ml-auto space-y-4 text-right">
                                            <!-- Arabic skeleton -->
                                            <div class="space-y-2" dir="rtl">
                                                <div class="h-6 md:h-8 bg-white/10 rounded-lg w-4/5 ml-auto"></div>
                                                <div class="h-6 md:h-8 bg-white/10 rounded-lg w-3/5 ml-auto"></div>
                                            </div>
                                            <!-- Translation skeleton -->
                                            <div class="space-y-2">
                                                <div class="h-4 bg-white/5 rounded-lg w-3/4 ml-auto"></div>
                                                <div class="h-4 bg-white/5 rounded-lg w-2/4 ml-auto"></div>
                                            </div>
                                        </div>
                                    {/each}
                                </div>
							{/if}
						</div>
                    {:else if currentView === 'verse' && currentVerseData}
						<div class="min-h-full min-w-full flex items-center justify-end p-4 md:p-8">
							{#key `${currentSurah}-${currentAyah}`}
							<div class="max-w-4xl w-full text-right verse-content select-none"
								 on:mousedown={() => handleVerseMouseDown(currentVerseData)}
								 on:mouseup={handleVerseMouseUp}
								 on:mouseleave={handleVerseMouseUp}
								 on:touchstart={() => handleVerseTouchStart(currentVerseData)}
								 on:touchend={handleVerseTouchEnd}
								 on:touchcancel={handleVerseTouchEnd}
								 role="button"
								 tabindex="0"
								 on:keydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										openTafseerModal(currentVerseData);
									}
								 }}>
                                <!-- Arabic Text -->
                                <div class="mb-6 md:mb-8 arabic-text" dir="rtl">
                                    <p class="text-2xl md:text-4xl leading-relaxed font-amiri text-white">
                                        {currentVerseData.arabic1}
                                    </p>
                                </div>

                                <!-- Translation -->
                                <div class="translation-text">
                                    <p class="text-lg md:text-xl leading-relaxed text-white/80 font-onest">
                                        {currentVerseData[selectedLanguage] || currentVerseData.english}
                                    </p>
                                </div>
                            </div>
                            {/key}
                        </div>
                    {:else if currentView === 'list' && allVerses.length > 0}
                        <!-- List View with Staggered Animation -->
                        <div class="p-4 md:p-8">
                            <div class="max-w-4xl ml-auto space-y-8 md:space-y-12">
                                <!-- Skeleton loading for previous surah -->
                                {#if loadingSurahs.has(loadedSurahRange.start - 1)}
                                    {@const prevSurah = surahs.find(s => s.surahNumber === loadedSurahRange.start - 1)}
                                    {#if prevSurah}
                                        <div class="mb-16 pb-8">
                                            <!-- Surah header skeleton -->
                                            <div class="surah-header mb-8 pb-6 border-b border-white/10 animate-pulse">
                                                <div class="text-right space-y-3">
                                                    <div class="text-4xl md:text-5xl font-chivo-mono text-white/10 font-bold">
                                                        {prevSurah.surahNumber}
                                                    </div>
                                                    <div class="space-y-2">
                                                        <h3 class="font-chivo-mono text-lg md:text-xl text-white/60">
                                                            SURAH {prevSurah.surahNumber}
                                                        </h3>
                                                        <h4 class="font-onest text-xl md:text-2xl text-white/40">
                                                            {prevSurah.surahName}
                                                        </h4>
                                                        <p class="font-amiri text-2xl md:text-3xl text-white/40" dir="rtl">
                                                            {prevSurah.surahNameArabic}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <!-- Verse skeletons -->
                                            {#each Array(3) as _, skeletonIndex}
                                                <div class="space-y-4 mb-8 animate-pulse">
                                                    <!-- Arabic skeleton -->
                                                    <div class="space-y-2" dir="rtl">
                                                        <div class="h-6 md:h-8 bg-white/10 rounded-lg w-4/5 ml-auto"></div>
                                                        <div class="h-6 md:h-8 bg-white/10 rounded-lg w-3/5 ml-auto"></div>
                                                    </div>
                                                    <!-- Translation skeleton -->
                                                    <div class="space-y-2">
                                                        <div class="h-4 bg-white/5 rounded-lg w-3/4 ml-auto"></div>
                                                        <div class="h-4 bg-white/5 rounded-lg w-2/4 ml-auto"></div>
                                                    </div>
                                                </div>
                                            {/each}
                                        </div>
                                    {/if}
                                {/if}
                                
                                {#each allVerses as verse, index}
                                    <div 
                                        class="verse-item transition-opacity duration-300 hover:opacity-100 select-none"
                                        data-ayah={verse.ayahNo}
                                        data-surah={verse.surahNo}
                                        on:mousedown={() => handleVerseMouseDown(verse)}
                                        on:mouseup={handleVerseMouseUp}
                                        on:mouseleave={handleVerseMouseUp}
                                        on:touchstart={() => handleVerseTouchStart(verse)}
                                        on:touchend={handleVerseTouchEnd}
                                        on:touchcancel={handleVerseTouchEnd}
										role="button"
										tabindex="0"
										on:keydown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												openTafseerModal(verse);
											}
										}}
										use:setupVerseObserver
                                    >
                                        <!-- Surah Header for new chapters -->
                                        {#if verse.ayahNo === 1}
                                            {@const surahInfo = surahs.find(s => s.surahNumber === verse.surahNo)}
                                            {#if surahInfo}
                                                <div class="surah-header mb-8 pb-6 border-b border-white/10">
                                                    <div class="text-right space-y-3">
                                                        <div class="text-4xl md:text-5xl font-chivo-mono text-white/20 font-bold">
                                                            {surahInfo.surahNumber}
                                                        </div>
                                                        <div class="space-y-2">
                                                            <h3 class="font-chivo-mono text-lg md:text-xl text-white/80">
                                                                SURAH {surahInfo.surahNumber}
                                                            </h3>
                                                            <h4 class="font-onest text-xl md:text-2xl text-white">
                                                                {surahInfo.surahName}
                                                            </h4>
                                                            <p class="font-amiri text-2xl md:text-3xl text-white/80" dir="rtl">
                                                                {surahInfo.surahNameArabic}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            {/if}
                                        {/if}

                                        <!-- Arabic Text -->
                                        <div class="text-right mb-4 verse-arabic" dir="rtl">
                                            <p class="text-xl md:text-2xl leading-relaxed font-amiri text-white">
                                                {verse.arabic1}
                                            </p>
                                        </div>

                                        <!-- Translation -->
                                        <div class="text-right mb-2 verse-translation">
                                            <p class="text-base md:text-lg leading-relaxed text-white/80 font-onest">
                                                {verse[selectedLanguage] || verse.english}
                                            </p>
                                        </div>

                                        <!-- Verse Number -->
                                        <div class="text-right verse-number">
                                            <span class="text-xs text-white/50 font-chivo-mono">
                                                {verse.surahNo}:{verse.ayahNo}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <!-- Auto-load trigger for next surah (when near end) -->
                                    {#if index === allVerses.length - 3 && verse.surahNo === loadedSurahRange.end}
                                        <div use:setupAutoLoadTrigger={{ direction: 'next' }}></div>
                                    {/if}
                                    
                                    <!-- Auto-load trigger for previous surah (when near beginning) -->
                                    {#if index === 2 && verse.surahNo === loadedSurahRange.start}
                                        <div use:setupAutoLoadTrigger={{ direction: 'prev' }}></div>
                                    {/if}
                                {/each}
                                
                                <!-- Skeleton loading for next surah -->
                                {#if loadingSurahs.has(loadedSurahRange.end + 1)}
                                    {@const nextSurah = surahs.find(s => s.surahNumber === loadedSurahRange.end + 1)}
                                    {#if nextSurah}
                                        <div class="mt-16 pt-8 border-t border-white/10">
                                            <!-- Surah header skeleton -->
                                            <div class="surah-header mb-8 pb-6 border-b border-white/10 animate-pulse">
                                                <div class="text-right space-y-3">
                                                    <div class="text-4xl md:text-5xl font-chivo-mono text-white/10 font-bold">
                                                        {nextSurah.surahNumber}
                                                    </div>
                                                    <div class="space-y-2">
                                                        <h3 class="font-chivo-mono text-lg md:text-xl text-white/60">
                                                            SURAH {nextSurah.surahNumber}
                                                        </h3>
                                                        <h4 class="font-onest text-xl md:text-2xl text-white/40">
                                                            {nextSurah.surahName}
                                                        </h4>
                                                        <p class="font-amiri text-2xl md:text-3xl text-white/40" dir="rtl">
                                                            {nextSurah.surahNameArabic}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <!-- Verse skeletons -->
                                            {#each Array(5) as _, skeletonIndex}
                                                <div class="space-y-4 mb-8 animate-pulse">
                                                    <!-- Arabic skeleton -->
                                                    <div class="space-y-2" dir="rtl">
                                                        <div class="h-6 md:h-8 bg-white/10 rounded-lg w-4/5 ml-auto"></div>
                                                        <div class="h-6 md:h-8 bg-white/10 rounded-lg w-3/5 ml-auto"></div>
                                                    </div>
                                                    <!-- Translation skeleton -->
                                                    <div class="space-y-2">
                                                        <div class="h-4 bg-white/5 rounded-lg w-3/4 ml-auto"></div>
                                                        <div class="h-4 bg-white/5 rounded-lg w-2/4 ml-auto"></div>
                                                    </div>
                                                </div>
                                            {/each}
                                        </div>
                                    {/if}
                                {/if}
                            </div>
                        </div>
                    {:else}
						<!-- No content placeholder -->
						<div class="h-full flex items-center justify-center">
							<div class="text-white/50 font-chivo-mono">
								{currentView === 'verse' ? 'No verse selected' : 'No verses loaded'}
							</div>
						</div>
                    {/if}
                </div>
			</div>
		</div>
		
		<!-- Navigation Arrows for Verse View (Mobile Only) -->
		{#if currentView === 'verse' && !isTransitioning && !contentLoading && isMobile}
			<!-- Previous Verse Arrow (Bottom Left) -->
			<button
				on:click={prevVerse}
				class="navigation-arrow fixed bottom-24 left-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white/70 hover:text-white"
				style="z-index: 1002;"
				aria-label="Previous verse"
				disabled={currentSurah === 1 && currentAyah === 1}
			>
				<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
					<path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd"></path>
				</svg>
			</button>
			
			<!-- Next Verse Arrow (Bottom Right) -->
			<button
				on:click={nextVerse}
				class="navigation-arrow fixed bottom-24 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white/70 hover:text-white"
				style="z-index: 1002;"
				aria-label="Next verse"
				disabled={currentSurah === 114 && surahs.find(s => s.surahNumber === 114)?.totalAyah === currentAyah}
			>
				<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
					<path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"></path>
				</svg>
			</button>
		{/if}
	{/if}
</div>

<!-- Tafseer Modal -->
{#if showTafseerModal && selectedTafseerVerse}
	<div 
		class="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
		on:click={closeTafseerModal}
		on:keydown={(e) => e.key === 'Escape' && closeTafseerModal()}
		role="button"
		tabindex="0"
		aria-label="Close tafseer modal"
	>
		<div 
			class="bg-black/95 border border-white/20 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden modal-content"
			on:click|stopPropagation
			role="dialog"
			aria-modal="true"
		>
			<!-- Modal Header -->
			<div class="border-b border-white/20 p-6">
				<div class="flex items-center justify-between mb-4">
					<div class="flex items-center gap-4">
						<h2 class="text-xl font-chivo-mono text-white">
							TAFSEER • {selectedTafseerVerse.surahNo}:{selectedTafseerVerse.ayahNo}
						</h2>
						{#if tafseerData}
							<span class="text-sm font-chivo-mono text-white/60">
								{tafseerData.surahName}
							</span>
						{/if}
					</div>
					<button
						on:click={closeTafseerModal}
						class="text-white/60 hover:text-white transition-colors p-2"
						aria-label="Close modal"
					>
						<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
						</svg>
					</button>
				</div>
				
				<!-- Verse Display -->
				<div class="space-y-4">
					<!-- Arabic Text -->
					<div class="text-right" dir="rtl">
						<p class="text-xl md:text-2xl leading-relaxed font-amiri text-white">
							{selectedTafseerVerse.arabic1}
						</p>
					</div>
					
					<!-- Translation -->
					<div class="text-right">
						<p class="text-base md:text-lg leading-relaxed text-white/80 font-onest">
							{selectedTafseerVerse[selectedLanguage] || selectedTafseerVerse.english}
						</p>
					</div>
				</div>
			</div>
			
			<!-- Modal Content -->
			<div class="overflow-y-auto max-h-[60vh] p-6 scrollbar">
				{#if tafseerLoading}
					<div class="flex items-center justify-center py-8">
						<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-white/60"></div>
						<span class="ml-3 text-white/60 font-chivo-mono text-sm">Loading tafseer...</span>
					</div>
				{:else if tafseerData}
					{@const selectedTafseer = tafseerData.tafsirs?.find(t => t.author === selectedTafseerAuthor)}
					{#if selectedTafseer}
						<div class="space-y-2">
							<div class="flex items-center justify-between border-b border-white/10 pb-2">
								<h3 class="text-lg font-chivo-mono text-white">
									{selectedTafseer.author}
								</h3>
								{#if selectedTafseer.groupVerse}
									<span class="text-xs font-chivo-mono text-white/50">
										{selectedTafseer.groupVerse}
									</span>
								{/if}
							</div>
							<div class="tafseer-content">
								<div class="text-white/90 leading-relaxed font-onest whitespace-pre-wrap tafseer-content-inner">
									{@html marked(selectedTafseer.content)}
								</div>
							</div>
						</div>
					{:else}
						<div class="text-center py-8">
							<p class="text-white/60 font-chivo-mono">No tafseer available for {selectedTafseerAuthor}</p>
						</div>
					{/if}
				{:else}
					<div class="text-center py-8">
						<p class="text-white/60 font-chivo-mono">Failed to load tafseer</p>
						<button 
							on:click={() => fetchTafseer(selectedTafseerVerse.surahNo, selectedTafseerVerse.ayahNo)}
							class="mt-4 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all font-chivo-mono text-sm text-white"
						>
							Retry
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	@import url('https://fonts.googleapis.com/css2?family=Amiri+Quran:wght@400;700&family=Onest:wght@400;700&family=Chivo+Mono:wght@400;700&display=swap');
	
	:global(.font-amiri) {
		font-family: 'Amiri Quran', serif;
	}
	
	:global(.font-onest) {
		font-family: 'Onest', sans-serif;
	}
	
	:global(.font-chivo-mono) {
		font-family: 'Chivo Mono', monospace;
	}
	
	/* British Racing Green */
	:global(.bg-british-racing-green) {
		background-color: #004225;
	}
	
	/* Responsive sidebar sizing */
	.sidebar-container {
		/* Default tablet/desktop size */
		width: 480px;
		min-width: 420px; /* Ensure minimum width */
	}
	
	.sidebar-numbers {
		width: 80px;
		min-width: 70px;
	}
	
	/* Tablet specific adjustments */
	@media (min-width: 769px) and (max-width: 1200px) {
		.sidebar-container {
			width: 420px; /* Slightly smaller for tablets */
			min-width: 400px;
		}
		
		.sidebar-numbers {
			width: 70px;
			min-width: 65px;
		}
	}
	
	/* Large desktop adjustments */
	@media (min-width: 1201px) {
		.sidebar-container {
			width: 520px; /* Larger for big screens */
			min-width: 480px;
		}
		
		.sidebar-numbers {
			width: 90px;
			min-width: 80px;
		}
	}
	
	/* Header responsive styling */
	.header-container {
		padding: 1.5rem 2rem;
		min-height: 80px; /* Ensure consistent height */
	}
	
	/* Tablet landscape - smaller header */
	@media (min-width: 768px) and (max-width: 1024px) and (orientation: landscape) {
		.header-container {
			padding: 1rem 1.5rem;
			min-height: 60px; /* Smaller header for tablet landscape */
		}
		
		.toggle-container {
			min-width: 140px;
			width: 140px;
		}
		
		.toggle-button {
			padding: 0.5rem 1rem;
			font-size: 0.75rem;
		}
		
		.control-select {
			padding: 0.5rem 0.75rem;
			font-size: 0.75rem;
		}
		
		.play-button {
			padding: 0.5rem 0.75rem;
			font-size: 0.75rem;
		}
		
		.position-indicator h1 {
			font-size: 0.75rem;
		}
	}
	
	@media (min-width: 769px) and (max-width: 1200px) {
		.header-container {
			padding: 1.25rem 1.5rem;
		}
	}
	
	/* Animated toggle switches */
	.toggle-container {
		min-width: 160px; /* Adjusted for equal split */
		width: 160px;
		display: block; /* Block container for relative positioning */
	}
	
	.toggle-container > .flex {
		display: flex; /* Ensure horizontal layout for buttons */
	}
	
	.toggle-slider {
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
		backdrop-filter: blur(4px);
		border-radius: 6px;
	}
	
	.toggle-button {
		flex: 1; /* Equal width for both buttons */
		font-weight: 500;
		letter-spacing: 0.025em;
		text-align: center;
		min-width: 0; /* Allow flex to work properly */
	}
	
	/* Mobile specific styles */
	.mobile-sidebar-overlay {
		background: rgba(0, 0, 0, 0.8);
		backdrop-filter: blur(4px);
	}
	
	.mobile-sidebar-container {
		box-shadow: 0 0 30px rgba(0, 0, 0, 0.5);
	}
	
	.mobile-sidebar-header {
		background: rgba(0, 0, 0, 0.2);
	}
	
	.mobile-view-toggle {
		background: rgba(0, 0, 0, 0.1);
	}
	
	.mobile-toggle-container {
		min-height: 48px;
		display: flex; /* Ensure mobile toggle is also horizontal */
	}
	
	.mobile-toggle-slider {
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		backdrop-filter: blur(4px);
	}
	
	.mobile-toggle-button {
		font-weight: 500;
		letter-spacing: 0.025em;
		min-height: 44px; /* Ensure touch-friendly size */
	}
	
	.mobile-content-container {
		background: rgba(0, 0, 0, 0.05);
	}
	
	.mobile-surah-numbers {
		background: rgba(0, 0, 0, 0.1);
	}
	
	.mobile-main-content {
		background: transparent;
	}
	
	.mobile-surah-info {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 12px;
		padding: 1rem;
	}
	
	.mobile-audio-controls {
		background: rgba(255, 255, 255, 0.08) !important;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}
	
	.mobile-ayah-grid {
		background: rgba(255, 255, 255, 0.03);
		border-radius: 12px;
		padding: 1rem;
	}
	
	/* Custom scrollbar and smooth scrolling */
	.verse-container, .sidebar-content {
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
		scroll-behavior: smooth;
		-webkit-overflow-scrolling: touch;
		overscroll-behavior: contain; /* Prevent rubber banding */
	}
	
	.verse-container::-webkit-scrollbar, .sidebar-content::-webkit-scrollbar {
		width: 8px;
	}
	
	.verse-container::-webkit-scrollbar-track, .sidebar-content::-webkit-scrollbar-track {
		background: transparent;
	}
	
	.verse-container::-webkit-scrollbar-thumb, .sidebar-content::-webkit-scrollbar-thumb {
		background-color: rgba(255, 255, 255, 0.2);
		border-radius: 4px;
	}
	
	.verse-container::-webkit-scrollbar-thumb:hover, .sidebar-content::-webkit-scrollbar-thumb:hover {
		background-color: rgba(255, 255, 255, 0.3);
	}

	/* Scroll shadows */
	.scroll-shadow {
		position: absolute;
		left: 0;
		right: 0;
		height: 20px;
		pointer-events: none;
		z-index: 10;
	}
	
	.scroll-shadow-top {
		top: 0;
		background: linear-gradient(to bottom, rgba(0, 66, 37, 0.8), transparent);
	}
	
	.scroll-shadow-bottom {
		bottom: 0;
		background: linear-gradient(to top, rgba(0, 66, 37, 0.8), transparent);
	}
	
	/* Sidebar shadows */
	.sidebar-shadow {
		position: absolute;
		left: 0;
		right: 0;
		height: 15px;
		pointer-events: none;
		z-index: 10;
	}
	
	.sidebar-shadow-top {
		top: 0;
		background: linear-gradient(to bottom, rgba(0, 0, 0, 0.6), transparent);
	}
	
	.sidebar-shadow-bottom {
		bottom: 0;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.6), transparent);
	}
	
	/* Surah header animations */
	.surah-header {
		animation: surahHeaderSlideIn 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
	}
	
	@keyframes surahHeaderSlideIn {
		0% {
			transform: translateX(50px);
			opacity: 0;
		}
		100% {
			transform: translateX(0);
			opacity: 1;
		}
	}

	/* Next surah preview animations */
	.next-surah-preview {
		animation: nextSurahSlideIn 1s cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
	}
	
	.next-surah-info {
		animation: nextSurahInfoFade 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.3s both;
	}
	
	@keyframes nextSurahSlideIn {
		0% {
			transform: translateX(40px);
			opacity: 0;
		}
		100% {
			transform: translateX(0);
			opacity: 1;
		}
	}
	
	@keyframes nextSurahInfoFade {
		0% {
			transform: translateY(20px);
			opacity: 0;
		}
		100% {
			transform: translateY(0);
			opacity: 1;
		}
	}

	/* List view animations - reduced for better performance */
	.verse-item {
		animation: verseItemSlideIn 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
		will-change: transform, opacity;
	}
	
	.verse-arabic {
		animation: verseArabicSlide 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
	}
	
	.verse-translation {
		animation: verseTranslationSlide 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.1s both;
	}
	
	.verse-number {
		animation: verseNumberFade 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.2s both;
	}
	
	@keyframes verseItemSlideIn {
		0% {
			transform: translateX(20px);
			opacity: 0;
		}
		100% {
			transform: translateX(0);
			opacity: 0.8;
		}
	}
	
	@keyframes verseArabicSlide {
		0% {
			transform: translateX(10px);
			opacity: 0;
		}
		100% {
			transform: translateX(0);
			opacity: 1;
		}
	}
	
	@keyframes verseTranslationSlide {
		0% {
			transform: translateX(8px);
			opacity: 0;
		}
		100% {
			transform: translateX(0);
			opacity: 0.8;
		}
	}
	
	@keyframes verseNumberFade {
		0% {
			opacity: 0;
		}
		100% {
			opacity: 0.5;
		}
	}

	/* Verse content animations */
	.verse-content {
		animation: verseSlideIn 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
	}
	
	.arabic-text {
		animation: arabicFadeIn 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.2s both;
	}
	
	.translation-text {
		animation: translationFadeIn 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.4s both;
	}
	
	@keyframes verseSlideIn {
		0% {
			transform: translateX(30px);
			opacity: 0;
		}
		100% {
			transform: translateX(0);
			opacity: 1;
		}
	}
	
	@keyframes arabicFadeIn {
		0% {
			transform: translateY(20px);
			opacity: 0;
		}
		100% {
			transform: translateY(0);
			opacity: 1;
		}
	}
	
	@keyframes translationFadeIn {
		0% {
			transform: translateY(15px);
			opacity: 0;
		}
		100% {
			transform: translateY(0);
			opacity: 0.8;
		}
	}
	
	/* Chapter transition animations */
	.chapter-transition {
		animation: chapterFadeIn 1.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
	}
	
	.chapter-info {
		animation: chapterInfoSlide 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.3s both;
	}
	
	.chapter-number {
		animation: numberPulse 2s cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite;
	}
	
	@keyframes chapterFadeIn {
		0% {
			opacity: 0;
			backdrop-filter: blur(0px);
		}
		100% {
			opacity: 1;
			backdrop-filter: blur(4px);
		}
	}
	
	@keyframes chapterInfoSlide {
		0% {
			transform: translateY(40px) scale(0.95);
			opacity: 0;
		}
		100% {
			transform: translateY(0) scale(1);
			opacity: 1;
		}
	}
	
	@keyframes numberPulse {
		0%, 100% {
			transform: scale(1);
			opacity: 0.2;
		}
			50% {
			transform: scale(1.05);
			opacity: 0.3;
		}
	}

	/* Smooth transitions for verse navigation */
	.verse-transition {
		transition: all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
	}

	/* Pulse animation for skeleton loading */
	@keyframes pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}
	
	.animate-pulse {
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	/* Select dropdown styling */
	select option {
		background-color: #004225;
		color: white;
	}

	/* Mobile touch improvements - including tablet portrait */
	@media (max-width: 767px), (min-width: 768px) and (max-width: 1024px) and (orientation: portrait) {
		.touch-button {
			min-height: 44px;
			min-width: 44px;
		}
		
		/* Mobile sidebar overlay improvements */
		.mobile-sidebar-overlay {
			position: fixed;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			z-index: 50;
		}
		
		/* Prevent text selection during swipes on mobile and improve scrolling */
		.verse-container {
			-webkit-user-select: none;
			-moz-user-select: none;
			-ms-user-select: none;
			user-select: none;
			-webkit-touch-callout: none;
			-webkit-tap-highlight-color: transparent;
			-webkit-overflow-scrolling: touch;
			overscroll-behavior-y: contain; /* Prevent rubber banding on mobile */
		}
		
		/* Mobile specific improvements */
		.mobile-toggle-button:active {
			transform: scale(0.98);
		}
		
		.mobile-audio-controls button:active {
			transform: scale(0.98);
		}
		
		.mobile-ayah-grid button:active {
			transform: scale(0.95);
		}
		
		.mobile-surah-numbers button:active {
			transform: scale(0.95);
		}
	}
	
	/* PC scroll improvements */
	@media (min-width: 769px) {
		/* Smooth verse transitions on PC */
		.verse-container {
			scroll-behavior: smooth;
			overscroll-behavior: contain; /* Prevent rubber banding on desktop */
		}
		
		/* Disable default scroll in verse view to enable wheel navigation */
		.verse-container.verse-view {
			overflow: hidden;
		}
	}
	
	/* Navigation arrows styles */
	.navigation-arrow {
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		transform: translateY(0);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        z-index: 1002;
	}
	
	.navigation-arrow:hover {
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		transform: translateY(-2px);
		box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
	}
	
	.navigation-arrow:active {
		transform: translateY(0) scale(0.95);
	}
	
	.navigation-arrow:disabled {
		opacity: 0.3;
		pointer-events: none;
		transform: translateY(0);
	}
	
	/* Mobile adjustments for navigation arrows */
	@media (max-width: 767px), (min-width: 768px) and (max-width: 1024px) and (orientation: portrait) {
		.navigation-arrow {
			bottom: 6rem !important; /* Position above page switcher (80px height + margin) */
		}
		
		.navigation-arrow:first-of-type {
			left: 1.5rem !important;
		}
		
		.navigation-arrow:last-of-type {
			right: 1.5rem !important;
		}
	}
	
	/* Hide navigation arrows on desktop */
	@media (min-width: 768px) {
		.navigation-arrow {
			display: none !important;
		}
	}

	/* Tafseer Modal Styles */
	.modal-content {
		animation: modalSlideIn 0.3s ease-out;
		transform-origin: center;
	}

	@keyframes modalSlideIn {
		from {
			opacity: 0;
			transform: scale(0.95) translateY(20px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	/* Long press visual feedback */
	.verse-item:active,
	.verse-content:active {
		transform: scale(0.98);
		transition: transform 0.1s ease-out;
	}

	/* Selection prevention during long press */
	.select-none {
		-webkit-user-select: none;
		-moz-user-select: none;
		-ms-user-select: none;
		user-select: none;
		-webkit-touch-callout: none;
	}

	/* Tafseer content styling - global to affect dynamically inserted HTML */
	:global(.tafseer-content-inner h1),
	:global(.tafseer-content-inner h2),
	:global(.tafseer-content-inner h3),
	:global(.tafseer-content-inner h4),
	:global(.tafseer-content-inner h5),
	:global(.tafseer-content-inner h6) {
		color: white !important;
		margin: 0.5rem 0 0.25rem 0 !important;
		font-weight: 600 !important;
		font-size: 1.25rem !important;
	}

	:global(.tafseer-content-inner p) {
		margin: 0.25rem 0 !important;
		line-height: 1.6 !important;
		font-weight: 400 !important;
		font-size: 1rem !important;
	}

	:global(.tafseer-content-inner ul),
	:global(.tafseer-content-inner ol) {
		margin: 0.25rem 0 !important;
		padding-left: 1.5rem;
	}

	:global(.tafseer-content-inner li) {
		margin: 0.1rem 0 !important;
	}

	:global(.tafseer-content-inner blockquote) {
		margin: 0.5rem 0 !important;
		padding-left: 1rem;
		border-left: 2px solid rgba(255, 255, 255, 0.3);
		font-style: italic;
	}

	:global(.tafseer-content-inner strong),
	:global(.tafseer-content-inner b) {
		color: white !important;
		font-weight: 600 !important;
	}

	.scrollbar {
		overflow-y: auto;
		overflow-x: hidden;
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
	}
</style>