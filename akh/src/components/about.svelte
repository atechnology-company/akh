<script lang="ts">
    import { onMount } from 'svelte';
    import { fade, slide } from 'svelte/transition';
    import { cubicOut } from 'svelte/easing';
    import { t } from '$lib/i18n';
    
    let showHeading = false;
    let gradientActive = false;
    let showContent = false;
    let showButtons = false;
    
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
    
    const colors = [
        '#ff6600', // Orange
        '#00ffff', // Cyan
        '#ffffff', // White
        '#ffd700', // Gold
        '#9370db'  // Purple
    ];
    
    let shapes: Shape[] = [];
    
    function createShape(id: number, type: 'star' | 'crescent') {
        // Ensure starting positions are well off-screen
        let x, y;
        const side = Math.floor(Math.random() * 4); // 0: top, 1: right, 2: bottom, 3: left
        
        if (side === 0) {
            x = Math.random() * 100;
            y = -100; // Much further off-screen
        } else if (side === 1) {
            x = 200; // Much further off-screen
            y = Math.random() * 100;
        } else if (side === 2) {
            x = Math.random() * 100;
            y = 200; // Much further off-screen
        } else {
            x = -100; // Much further off-screen
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
        
        const speed = Math.random() * 0.2 + 0.1; // Increased speed
        const dx = Math.cos(angle) * speed;
        const dy = Math.sin(angle) * speed;
        
        shapes.push({
            id,
            x,
            y,
            size: Math.random() * 20 + 15,
            rotation: Math.random() * 360,
            color: colors[Math.floor(Math.random() * colors.length)],
            type,
            dx,
            dy,
            rotationSpeed: (Math.random() - 0.5) * 1.2 // Faster rotation
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
            
            // Check if shape is completely out of bounds
            if (x < -100 || x > 200 || y < -100 || y > 200) {
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
                    newY = -100;
                } else if (newSide === 1) {
                    newX = 200;
                    newY = Math.random() * 100;
                } else if (newSide === 2) {
                    newX = Math.random() * 100;
                    newY = 200;
                } else {
                    newX = -100;
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
                
                const newSpeed = Math.random() * 0.2 + 0.1; // Increased speed
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
                    color: colors[Math.floor(Math.random() * colors.length)],
                    rotationSpeed: (Math.random() - 0.5) * 1.2 // Faster rotation
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
    });
</script>

<!-- Islamic geometric background -->
<div class="background">
    <!-- Dot matrix overlay -->
    <div class="dot-matrix"></div>
    
    <!-- SVG shapes -->
    <svg class="shapes" viewBox="-50 -50 100 100" preserveAspectRatio="xMidYMid slice">
        {#each shapes as shape (shape.id)}
            <g style="transform: translate({shape.x}%, {shape.y}%) rotate({shape.rotation}deg);">
                {#if shape.type === 'star'}
                    <path 
                        d={getStarPoints(shape.size)} 
                        fill={shape.color}
                        class="shape"
                    />
                {:else}
                    <path 
                        d={getCrescentPath(shape.size)} 
                        fill={shape.color}
                        fill-rule="evenodd"
                        class="shape"
                    />
                {/if}
            </g>
        {/each}
    </svg>
</div>

<div class="container">
    <div class="about-container">
        {#if showHeading}
            <h1 class="visible white-text" class:gradient-active={gradientActive}>
                {t('greeting')}
            </h1>
        {/if}
        
        {#if showContent}
            <div class="content-wrapper" transition:slide={{ duration: 800, easing: cubicOut, axis: 'y' }}>
                <div class="content-fade" in:fade={{ duration: 600, delay: 200 }}>
                    <p>i'm max, or abdurrahman, and i am a cantonese-english muslim teen and the founder of <span style="color: #ff6600;">a</span>technology company. i started akh because there are a lot of salah time apps, however none looked exactly the way i wanted them to or had the feature set i wanted. i want something minimal and something that looks beautiful. i like making applications and it is my job, you can view my <a href="https://undivisible.dev/" class="personal-link">personal website</a> and my <a href="https://atechnology.company/" class="business-link">business website</a>.</p>
                    <p>now, you may notice there are two buttons at the bottom. the left one goes to my <a href="https://buymeacoffee.com/undivisible" class="link-donations">link for donations</a>. i make no money off personal projects like these, so it is appreciated. i always put it back into my projects, charity, or i eat food. i usually work alone, or i have some brothers that help every now and then. however, "the other button" goes to the <a href="https://www.alihsan.org.au/project/emergency-appeal" class="foundation-link">Al-Ihsan Foundation</a>, and they support people who actually need it, unlike me. (i have some other sources of income). i'm just leaving that option open, it's there.</p>
                    <p>jazakAllah khair, tyvm for donating, if you do :)</p>
                </div>
            </div>
        {/if}
        {#if showButtons}
            <div class="buttons" transition:slide={{ duration: 400, easing: cubicOut, axis: 'y' }}>
                <a href="https://buymeacoffee.com/undivisible" class="donate-button">donate here</a>
                <a href="https://www.alihsan.org.au/project/emergency-appeal" class="foundation-button">the other button</a>
            </div>
        {/if}
    </div>
</div>

<style>
    /* Background styles */
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
        background-image: radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px);
        background-size: 15px 15px; /* Larger dot spacing */
        z-index: 1;
        pointer-events: none;
    }
    
    .shapes {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 0; /* Put shapes behind dots */
        mask-image: radial-gradient(circle, rgba(255,255,255,1) 1.5px, transparent 1.5px);
        mask-size: 15px 15px;
        -webkit-mask-image: radial-gradient(circle, rgba(255,255,255,1) 1.5px, transparent 1.5px);
        -webkit-mask-size: 15px 15px;
        opacity: 0.5;
    }
    
    .shape {
        mix-blend-mode: screen;
        opacity: 1;
        filter: blur(0.5px); /* Less blur for sharper shapes */
    }
    
    /* Container styles */
    .container {
        display: flex;
        justify-content: center;
        align-items: left;
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
        align-items: left;
        flex-direction: column;
        padding: 1rem;
        max-width: 600px;
        margin: 0 auto;
        overflow: hidden;
        border-radius: 0.75rem;
    }
    
    h1 {
        font-size: 2.5rem;
        margin-bottom: 1.5rem;
        opacity: 0;
        transition: opacity 0.5s ease;
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
        content: "Assalamualaikum!";
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-clip: text;
        -webkit-background-clip: text;
        color: transparent;
        background-size: 300% 100%;
        background-image: linear-gradient(to right, 
            rgba(255, 255, 255, 0), 
            rgba(255,102,0,1),
            rgba(255,255,255,0)
        );
        background-position: -300% center;
        pointer-events: none;
        opacity: 0;
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
        color: #ff6600;
        text-decoration: none;
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
    }
    
    .donate-button {
        margin-right: auto;  /* Push to left */
        background-color: #ff6600;
    }
    
    .foundation-button {
        margin-left: auto;  /* Push to right */
        background-color: #ff6600;
    }

    a:hover {
        text-decoration: underline;
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