<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { fade, slide } from 'svelte/transition';
    import { cubicOut } from 'svelte/easing';
    import { t, currentLanguage, tStore } from '$lib/i18n';
    import { languageTag } from '$lib/paraglide/runtime';
    import { settings } from '$lib/stores/settings';
    import { browser } from '$app/environment';
    import { prayerTimesStore, updateColorsBasedOnPrayerTimes } from '../modules/salah';
    import { accentColor, gradientColor } from '$lib/stores/accentColor';
    import { writable } from 'svelte/store';
    
    let showHeading = false;
    let gradientActive = false;
    let showContent = false;
    let showButtons = false;
    let greetingText = '';
    let gradientColors: string[] = [];
    
    // Function to extract colors from gradient string
    function extractGradientColors(gradientString: string): string[] {
        console.log('Extracting colors from gradient:', gradientString);
        
        // First try to extract RGB/RGBA colors
        const rgbRegex = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*\d+(?:\.\d+)?)?\s*\)/g;
        const rgbMatches = Array.from(gradientString.matchAll(rgbRegex) || []);
        
        // Then extract hex colors
        const hexRegex = /#[0-9A-Fa-f]{3,6}/g;
        const hexMatches = Array.from(gradientString.match(hexRegex) || []);
        
        // Look for named CSS colors (common prayer time colors used in the app)
        const namedColors: { [key: string]: string[] } = {
            'linear-gradient(135deg, #1a2a6c, #b21f1f, #fdbb2d)': ['#1a2a6c', '#b21f1f', '#fdbb2d'], // fajr
            'linear-gradient(135deg, #FF9500, #ff2d00, #ffb01f)': ['#FF9500', '#ff2d00', '#ffb01f'], // sunrise/duha
            'linear-gradient(135deg, #8ae068, #0072ff)': ['#8ae068', '#0072ff', '#0072ff'], // dhuhr
            'linear-gradient(135deg, #dda65e, #ef473a)': ['#dda65e', '#ef473a', '#ef473a'], // asr
            'linear-gradient(135deg, #ef473a, #b42460)': ['#ef473a', '#b42460', '#b42460'], // maghrib
            'linear-gradient(135deg, #0f2027, #203a43, #2c5364)': ['#0f2027', '#203a43', '#2c5364'], // isha
            'linear-gradient(135deg, #0b122b, #3f0c41, #7a0270)': ['#0b122b', '#3f0c41', '#7a0270'], // tahajjud
            'linear-gradient(135deg, #2C3E50, #4B6CB7, #182848)': ['#2C3E50', '#4B6CB7', '#182848'], // witr
        };
        
        // If we have an exact match in our known gradients, use those colors
        if (namedColors[gradientString]) {
            console.log('Found named colors match:', namedColors[gradientString]);
            return namedColors[gradientString];
        }
        
        // Convert RGB matches to hex format
        const rgbHexMatches = rgbMatches.map(match => {
            const r = parseInt(match[1], 10);
            const g = parseInt(match[2], 10);
            const b = parseInt(match[3], 10);
            return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        });
        
        // Combine all matches
        const allMatches = [...hexMatches, ...rgbHexMatches];
        
        // Make sure we have at least 3 colors, duplicating if necessary
        const colors = allMatches.slice(0, 3);
        while (colors.length < 3 && colors.length > 0) {
            colors.push(colors[colors.length - 1]);
        }
        
        console.log('Extracted colors:', colors);
        
        // Fallback to default colors if we couldn't extract any
        if (colors.length === 0) {
            console.log('Using fallback colors');
            return ['#1a2a6c', '#b21f1f', '#fdbb2d']; // Default fajr colors
        }
        
        return colors;
    }
    
    // Subscribe to gradient color changes
    // Colors are now managed by salah.ts but we still need to extract them for gradient animation
    $: {
        // Only extract gradient colors for animation
        gradientColors = extractGradientColors($gradientColor);
        
        // Update shape colors whenever gradientColors changes
        if (shapes.length > 0) {
            shapes = shapes.map(shape => {
                return {
                    ...shape,
                    color: shape.type === 'star' ? gradientColors[0] : gradientColors[1]
                };
            });
        }
    }
    
    // Subscribe to language changes
    const unsubscribe = currentLanguage.subscribe(lang => {
        // Update greeting text when language changes
        greetingText = t('greeting');
    });
    
    // Background animation
    type Shape = {
        id: number;
        x: number;
        y: number;
        size: number;
        rotation: number;
        color: string;
        type: 'star' | 'crescent';
        dx: number;
        dy: number;
        rotationSpeed: number;
    };
    
    let shapes: Shape[] = [];
    
    function createShape(id: number, type: 'star' | 'crescent') {
        // Ensure starting positions are GUARANTEED off-screen
        let x, y;
        const side = Math.floor(Math.random() * 4); // 0: top, 1: right, 2: bottom, 3: left
        
        // Use much larger offsets to guarantee shapes start fully off-screen
        if (side === 0) {
            x = Math.random() * 100; // Horizontal position anywhere along width
            y = -120; // Far above viewport
        } else if (side === 1) {
            x = 220; // Far right of viewport
            y = Math.random() * 100;
        } else if (side === 2) {
            x = Math.random() * 100; 
            y = 220; // Far below viewport
        } else {
            x = -120; // Far left of viewport
            y = Math.random() * 100;
        }
        
        // Random direction vector that ensures crossing the screen
        let angle = 0;
        if (side === 0) {
            // Coming from top, angle between 30° and 150° (pointing down)
            angle = (Math.random() * 120 + 30) * Math.PI / 180;
        } else if (side === 1) {
            // Coming from right, angle between 120° and 240° (pointing left)
            angle = (Math.random() * 120 + 120) * Math.PI / 180;
        } else if (side === 2) {
            // Coming from bottom, angle between 210° and 330° (pointing up)
            angle = (Math.random() * 120 + 210) * Math.PI / 180;
        } else {
            // Coming from left, angle between 300° and 60° (pointing right)
            angle = ((Math.random() * 120 + 300) % 360) * Math.PI / 180;
        }
        
        const speed = Math.random() * 0.3 + 0.2; // Faster speed
        const dx = Math.cos(angle) * speed;
        const dy = Math.sin(angle) * speed;
        
        shapes.push({
            id,
            x,
            y,
            size: Math.random() * 20 + 15,
            rotation: Math.random() * 360,
            color: $gradientColor,
            type,
            dx,
            dy,
            rotationSpeed: (Math.random() - 0.5) * 1.5 // Faster rotation
        });
    }
    
    function createShapes() {
        shapes = [];
        // Create 3 stars
        for (let i = 0; i < 3; i++) {
            createShape(i, 'star');
        }
        
        // Create 3 crescents
        for (let i = 3; i < 6; i++) {
            createShape(i, 'crescent');
        }
    }
    
    function updateShapes() {
        shapes = shapes.map(shape => {
            let { id, x, y, rotation, dx, dy, rotationSpeed, type } = shape;
            
            // Update position
            x += dx;
            y += dy;
            
            // Update rotation
            rotation = (rotation + rotationSpeed) % 360;
            
            // Check if shape is out of bounds with larger boundaries for safety
            if (x < -150 || x > 250 || y < -150 || y > 250) {
                // Create a new shape of the same type, but from a different edge
                const currentSide = 
                    y < -50 ? 0 : // top
                    x > 150 ? 1 : // right
                    y > 150 ? 2 : // bottom
                    3;           // left
                
                // Choose a different side for the new shape
                let newSide;
                do {
                    newSide = Math.floor(Math.random() * 4);
                } while (newSide === currentSide);
                
                let newX, newY;
                if (newSide === 0) {
                    newX = Math.random() * 100;
                    newY = -120;
                } else if (newSide === 1) {
                    newX = 220;
                    newY = Math.random() * 100;
                } else if (newSide === 2) {
                    newX = Math.random() * 100;
                    newY = 220;
                } else {
                    newX = -120;
                    newY = Math.random() * 100;
                }
                
                // Calculate new angle for proper screen crossing
                let newAngle = 0;
                if (newSide === 0) {
                    newAngle = (Math.random() * 120 + 30) * Math.PI / 180;
                } else if (newSide === 1) {
                    newAngle = (Math.random() * 120 + 120) * Math.PI / 180;
                } else if (newSide === 2) {
                    newAngle = (Math.random() * 120 + 210) * Math.PI / 180;
                } else {
                    newAngle = ((Math.random() * 120 + 300) % 360) * Math.PI / 180;
                }
                
                const newSpeed = Math.random() * 0.3 + 0.2; // Faster speed
                const newDx = Math.cos(newAngle) * newSpeed;
                const newDy = Math.sin(newAngle) * newSpeed;
                
                return {
                    ...shape,
                    x: newX,
                    y: newY,
                    dx: newDx,
                    dy: newDy,
                    rotation: Math.random() * 360,
                    size: Math.random() * 20 + 15,
                    color: $gradientColor,
                    rotationSpeed: (Math.random() - 0.5) * 1.5 // Faster rotation
                };
            }
            
            return { ...shape, x, y, rotation };
        });
        
        requestAnimationFrame(updateShapes);
    }
    
    // Generate star points - fixed to create proper star
    function getStarPoints(size: number): string {
        const outerRadius = size;
        const innerRadius = size * 0.4;
        let path = '';
        
        for (let i = 0; i < 5; i++) {
            // Outer point
            const outerAngle = (i * 2 * Math.PI / 5) - Math.PI / 2;
            const outerX = outerRadius * Math.cos(outerAngle);
            const outerY = outerRadius * Math.sin(outerAngle);
            
            // Inner point
            const innerAngle = ((i + 0.5) * 2 * Math.PI / 5) - Math.PI / 2;
            const innerX = innerRadius * Math.cos(innerAngle);
            const innerY = innerRadius * Math.sin(innerAngle);
            
            if (i === 0) {
                path += `M ${outerX.toFixed(2)} ${outerY.toFixed(2)} `;
            } else {
                path += `L ${outerX.toFixed(2)} ${outerY.toFixed(2)} `;
            }
            
            path += `L ${innerX.toFixed(2)} ${innerY.toFixed(2)} `;
        }
        
        return path + 'Z';
    }
    
    // Generate crescent path - proper Islamic crescent moon shape
    function getCrescentPath(size: number): string {
        // Two-arc approach for proper crescent shape
        const outerRadius = size;
        const innerRadius = size * 0.65;
        const startX = size * 0.2;
        const endX = startX;
        
        return `
          M ${startX} ${-outerRadius * 0.5}
          A ${outerRadius} ${outerRadius} 0 1 0 ${startX} ${outerRadius * 0.5}
          A ${innerRadius} ${innerRadius} 0 1 1 ${endX} ${-outerRadius * 0.5}
          Z
        `;
    }
    
    onMount(() => {
        // Set greeting text for animation
        greetingText = t('greeting');
        
        // Extract gradient colors on mount
        gradientColors = extractGradientColors($gradientColor);
        
        // Force update colors if prayer times are available
        if (browser && $prayerTimesStore) {
            console.log('About component: Forcing color update based on prayer times');
            updateColorsBasedOnPrayerTimes($prayerTimesStore);
        }
        
        // Subscribe to color changes
        const unsubscribeAccent = accentColor.subscribe(newColor => {
            console.log('Accent color changed to:', newColor);
        });
        
        const unsubscribeGradient = gradientColor.subscribe(newGradient => {
            console.log('Gradient color changed to:', newGradient);
            gradientColors = extractGradientColors(newGradient);
            
            // Also update shape colors
            shapes = shapes.map(shape => ({
                ...shape,
                color: shape.type === 'star' ? gradientColors[0] : gradientColors[1]
            }));
        });
        
        // Create all shapes immediately
        createShapes();
        
        // Start the animation immediately
        updateShapes();
        
        // Animation sequence for content
        setTimeout(() => {
            showHeading = true; // Show white text
            
            setTimeout(() => {
                gradientActive = true; // Activate gradient animation
                
                // Show content with feathered linear wipe after gradient completes
                setTimeout(() => {
                    showContent = true;
                    
                    // Show buttons sooner
                    setTimeout(() => {
                        showButtons = true;
                    }, 400);
                }, 500);
            }, 600);
        }, 300);
        
        return () => {
            // Clean up subscriptions
            unsubscribe();
            unsubscribeAccent();
            unsubscribeGradient();
        };
    });
</script>

<div class="about-page" style="--gradient-color-1: {gradientColors[0] || '#1a2a6c'}; --gradient-color-2: {gradientColors[1] || '#b21f1f'}; --gradient-color-3: {gradientColors[2] || '#fdbb2d'};">
    <!-- Islamic geometric background -->
    <div class="background">
        <!-- Dot matrix overlay -->
        <div class="dot-matrix"></div>
        
        <!-- SVG shapes -->
        <svg class="shapes" viewBox="-50 -50 100 100" preserveAspectRatio="xMidYMid slice">
            <defs>
                {#each shapes as shape (shape.id)}
                    {#if shape.type === 'star'}
                        <linearGradient id={`shapeGradient-${shape.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color={gradientColors[0] || '#1a2a6c'} />
                            <stop offset="50%" stop-color={gradientColors[1] || '#b21f1f'} />
                            <stop offset="100%" stop-color={gradientColors[2] || '#fdbb2d'} />
                        </linearGradient>
                    {:else}
                        <linearGradient id={`shapeGradient-${shape.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color={gradientColors[0] || '#1a2a6c'} />
                            <stop offset="50%" stop-color={gradientColors[1] || '#b21f1f'} />
                            <stop offset="100%" stop-color={gradientColors[2] || '#fdbb2d'} />
                        </linearGradient>
                    {/if}
                {/each}
            </defs>
            {#each shapes as shape (shape.id)}
                <g style="transform: translate({shape.x}%, {shape.y}%) rotate({shape.rotation}deg);">
                    {#if shape.type === 'star'}
                        <path 
                            d={getStarPoints(shape.size)} 
                            fill={`url(#shapeGradient-${shape.id})`}
                            class="shape"
                        />
                    {:else}
                        <path 
                            d={getCrescentPath(shape.size)} 
                            fill={`url(#shapeGradient-${shape.id})`}
                            fill-rule="evenodd"
                            class="shape"
                        />
                    {/if}
                </g>
            {/each}
        </svg>
    </div>
    
    <!-- Content section -->
    <div class="container">
        <div class="about-container">
            {#if showHeading}
                <h1 class="visible white-text" class:gradient-active={gradientActive} data-greeting={greetingText}>
                    {greetingText}
                </h1>
            {/if}
            
            {#if showContent}
                <div class="content-wrapper" transition:slide={{ duration: 800, easing: cubicOut, axis: 'y' }}>
                    <div class="content-fade" in:fade={{ duration: 600, delay: 200 }}>
                        <p>i'm max, or abdurrahman, and i am a cantonese-english muslim teen and the founder of <span style="color: #ff5705;">a</span>technology company. i started akh because there are a lot of salah time apps, however none looked exactly the way i wanted them to or had the feature set i wanted. i want something minimal and something that looks beautiful. i like making applications and it is my job, you can view my <a href="https://undivisible.dev/" class="personal-link">personal website</a> and my <a href="https://atechnology.company/" class="business-link">business website</a>.</p>
                        <p>now, you may notice there are two buttons at the bottom. the left one goes to my <a href="https://buymeacoffee.com/undivisible" class="link-donations">link for donations</a>. i make no money off personal projects like these, so it is appreciated. i always put it back into my projects, charity, or i eat food. i usually work alone, or i have some brothers that help every now and then. however, "the other button" goes to the <a href="https://www.alihsan.org.au/project/emergency-appeal" class="foundation-link">Al-Ihsan Foundation</a>, and they support people who actually need it, unlike me. (i have some other sources of income). i'm just leaving that option open, it's there.</p>
                        <p>jazakAllah khair, tyvm for donating, if you do))</p>
                    </div>
                </div>
            {/if}
            {#if showButtons}
                <div class="buttons" transition:slide={{ duration: 400, easing: cubicOut, axis: 'y' }}>
                    <a href="https://buymeacoffee.com/undivisible" class="donate-button">{t('donate_here')}</a>
                    <a href="https://www.alihsan.org.au/project/emergency-appeal" class="foundation-button">{t('the_other_button')}</a>
                </div>
            {/if}
        </div>
    </div>
    <!-- Version info -->
    <div class="version-info">akh v0.3.1 alpha - an <span style="color: #ff5705;">a</span>technology company project</div>
</div>

<style>
    /* Background styles */
    .about-page {
        --gradient-color-1: var(--accent-color, #1a2a6c);
        --gradient-color-2: var(--accent-color, #b21f1f);
        --gradient-color-3: var(--accent-color, #fdbb2d);
        height: 100vh;
        width: 100%;
        display: flex;
        flex-direction: column;
    }
    
    .background {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 0;
        background: #121212;
        overflow: hidden;
    }
    
    .dot-matrix {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-image: radial-gradient(circle, var(--accent-color) 1px, transparent 1px);
        background-size: 15px 15px;
        z-index: 1;
        pointer-events: none;
        opacity: 0.1;
    }
    
    .shapes {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 0;
        mask-image: radial-gradient(circle, rgba(255,255,255,1) 1.5px, transparent 1.5px);
        mask-size: 15px 15px;
        -webkit-mask-image: radial-gradient(circle, rgba(255,255,255,1) 1.5px, transparent 1.5px);
        -webkit-mask-size: 15px 15px;
        opacity: 0.3;
        animation: gradientMove 20s linear infinite;
    }
    
    .shape {
        mix-blend-mode: screen;
        opacity: 1;
        filter: blur(0.5px);
        animation: shapeFloat 8s ease-in-out infinite;
    }
    
    @keyframes gradientMove {
        0% {
            background-position: 0% 0%;
        }
        100% {
            background-position: 100% 100%;
        }
    }
    
    @keyframes shapeFloat {
        0%, 100% {
            transform: translateY(0) scale(1);
        }
        50% {
            transform: translateY(-20px) scale(1.1);
        }
    }
    
    /* Container styles */
    .container {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100%;
        width: 100%;
        max-width: none;
        font-family: 'Onest', sans-serif;
        position: relative;
        z-index: 10;
        background-color: transparent;
    }
    
    .about-container {
        display: flex;
        justify-content: center;
        align-items: flex-start;
        flex-direction: column;
        padding: 1rem;
        max-width: 600px;
        margin: auto;
        overflow: hidden;
        border-radius: 0.75rem;
        text-align: left;
    }
    
    h1 {
        font-size: 2.5rem;
        margin-bottom: 1.5rem;
        opacity: 0;
        transition: opacity 0.5s ease;
        align-self: flex-start;
        text-align: left;
    }
    
    h1.visible {
        opacity: 1;
        transition: opacity 0.5s ease;
    }
    
    .white-text {
        color: white;
        position: relative;
    }
    
    .white-text::before {
        content: attr(data-greeting);
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-clip: text;
        -webkit-background-clip: text;
        color: transparent;
        background-size: 300% 100%;
        background-image: linear-gradient(135deg, 
            #fff 0%,
            #fff 15%,
            var(--gradient-color-1, #1a2a6c) 30%,
            var(--gradient-color-2, #b21f1f) 50%,
            var(--gradient-color-3, #fdbb2d) 70%,
            #fff 85%,
            #fff 100%
        );
        background-position: -300% center;
        pointer-events: none;
        opacity: 0;
        transform: translateZ(0);
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
    }
    
    .gradient-active::before {
        animation: gradientSlide 0.5s ease-in-out forwards;
        animation-iteration-count: 1;
        animation-fill-mode: forwards;
    }
    
    @keyframes gradientSlide {
        0% {
            background-position: 0% center;
            opacity: 1;
        }
        99% {
            opacity: 1;
        }
        100% {
            background-position: 100% center;
            opacity: 0;
        }
    }
    
    .content-wrapper {
        position: relative;
    }
    
    .content-fade {
        position: relative;
    }
    
    p {
        margin-bottom: 1rem;
        line-height: 1.6;
    }
    
    .personal-link, .business-link, .link-donations, .foundation-link {
        color: var(--gradient-color-2);
        text-decoration: none;
        position: relative;
        background-image: linear-gradient(135deg, 
            var(--gradient-color-2) 0%,
            var(--gradient-color-2) 100%
        );
        background-clip: text;
        -webkit-background-clip: text;
        background-size: 200% 100%;
        background-position: 0% center;
        transition: color 0.2s ease-out;
    }
    
    .personal-link:hover, .business-link:hover, .link-donations:hover, .foundation-link:hover {
        color: transparent;
        text-decoration: none;
        background-image: linear-gradient(135deg, 
            var(--gradient-color-2) 0%,
            var(--accent-color) 20%, 
            var(--gradient-color-1) 40%,
            var(--gradient-color-2) 60%,
            var(--accent-color) 80%,
            var(--gradient-color-2) 100%
        );
        animation: linkHover 1.2s ease-in-out 0.15s;
        animation-fill-mode: forwards;
    }

    .personal-link:not(:hover), .business-link:not(:hover), 
    .link-donations:not(:hover), .foundation-link:not(:hover) {
        background-position: 0% center;
    }

    @keyframes linkHover {
        0% {
            background-position: 0% center;
            color: transparent;
        }
        50% {
            background-position: 100% center;
            color: transparent;
        }
        100% {
            background-position: 0% center;
            color: var(--gradient-color-2);
        }
    }
    
    .buttons {
        display: flex;
        justify-content: space-between;
        margin-top: 2rem;
        width: 100%;
        padding: 0;
    }
    
    .donate-button, .foundation-button {
        display: inline-block;
        padding: 0.8rem 1.5rem;
        border-radius: 2rem;
        text-decoration: none;
        font-weight: bold;
        color: white;
        text-align: center;
        min-width: 10rem;
        background: linear-gradient(135deg, var(--gradient-color-1), var(--gradient-color-2));
        transition: all 0.3s ease;
    }
    
    .donate-button:hover, .foundation-button:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        filter: brightness(1.1);
    }
    
    .donate-button {
        margin-right: auto;  /* Push to left */
    }
    
    .foundation-button {
        margin-left: auto;  /* Push to right */
    }

    a {
        color: var(--accent-color);
    }

    a:hover {
        text-decoration: underline;
    }
    
    .version-info {
        position: absolute;
        bottom: 1rem;
        left: 1rem;
        color: #888;
        font-size: 0.8rem;
        z-index: 20;
    }

    /* Media queries for responsive text size on mobile */
    @media (max-width: 768px) {
        h1 {
            font-size: 2rem;
            margin-bottom: 1rem;
        }
        
        p {
            font-size: 0.9rem;
            line-height: 1.5;
            margin-bottom: 0.8rem;
        }
        
        .about-container {
            padding: 0.8rem;
            max-width: 90%;
        }
        
        .donate-button, .foundation-button {
            padding: 0.6rem 1.2rem;
            min-width: 8rem;
            font-size: 0.9rem;
        }
    }
    
    /* Even smaller text for very small screens */
    @media (max-width: 480px) {
        h1 {
            font-size: 1.8rem;
        }
        
        p {
            font-size: 0.85rem;
        }
        
        .donate-button, .foundation-button {
            padding: 0.5rem 1rem;
            min-width: 7rem;
            font-size: 0.8rem;
        }
    }
</style>