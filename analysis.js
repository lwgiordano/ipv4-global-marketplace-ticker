// IPv4 Global Marketplace Analysis Dashboard

// API Configuration
const API_BASE = 'https://y1dq7hifob.execute-api.eu-west-1.amazonaws.com/prod/api';
const PRIOR_SALES_ENDPOINT = `${API_BASE}/priorSales`;
const NEW_LISTINGS_ENDPOINT = `${API_BASE}/currentListing`;

// Data storage
let priorSalesData = [];
let newListingsData = [];
let filteredSalesData = [];
let filteredListingsData = [];

// Color scheme matching IPv4.Global style guide
const COLORS = {
    primary: '#0062FF',
    secondary: '#004ECC',
    arin: '#ADD4E4',      // Accent 3 (ARIN)
    ripe: '#FFE070',      // Accent 5 (RIPE)
    apnic: '#ECC6AE',     // Accent 2 (APNIC)
    lacnic: '#CFDEBF',    // Accent 4 (LACNIC)
    afrinic: '#CDCEEA',   // Accent 1 (AFRINIC)
    grid: '#E3E5E5',
    text: '#212121'
};

// Simple Chart Library using Canvas
class SimpleChart {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.canvasId = canvasId;

        this.setupCanvas();

        this.padding = { top: 40, right: 30, bottom: 60, left: 70 };
        this.tooltip = document.getElementById('chartTooltip');
        this.dataPoints = [];
        this.animationProgress = 0;

        // Add mouse event listeners for tooltip
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseleave', () => this.hideTooltip());
    }

    setupCanvas() {
        // Get the parent container width
        const container = this.canvas.parentElement;
        const containerWidth = container.clientWidth;

        // Set display size (CSS pixels) with proper aspect ratio
        const displayWidth = containerWidth;
        const displayHeight = Math.min(400, Math.max(280, containerWidth * 0.6));

        // Fix blurry text on high-DPI displays
        const dpr = window.devicePixelRatio || 1;

        // Set canvas display size
        this.canvas.style.width = displayWidth + 'px';
        this.canvas.style.height = displayHeight + 'px';

        // Set actual canvas size (scaled for DPR)
        this.canvas.width = displayWidth * dpr;
        this.canvas.height = displayHeight * dpr;

        // Scale context for DPR
        this.ctx.scale(dpr, dpr);

        // Store display dimensions for drawing
        this.width = displayWidth;
        this.height = displayHeight;
    }

    clear() {
        // Reset transform before clearing
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // Reapply DPR scaling
        const dpr = window.devicePixelRatio || 1;
        this.ctx.scale(dpr, dpr);
        this.dataPoints = [];
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Check if mouse is over any data point
        for (const point of this.dataPoints) {
            const distance = Math.sqrt(Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2));
            if (distance < (point.radius || 10)) {
                this.showTooltip(point, e.clientX, e.clientY);
                return;
            }
        }
        this.hideTooltip();
    }

    showTooltip(point, clientX, clientY) {
        this.tooltip.innerHTML = point.label;
        this.tooltip.style.display = 'block';
        this.tooltip.style.left = (clientX + 10) + 'px';
        this.tooltip.style.top = (clientY - 30) + 'px';
        // Trigger smooth animation
        setTimeout(() => this.tooltip.classList.add('show'), 10);
    }

    hideTooltip() {
        this.tooltip.classList.remove('show');
        setTimeout(() => {
            this.tooltip.style.display = 'none';
        }, 200);
    }

    animate(drawCallback, duration = 800) {
        const startTime = Date.now();
        const animateFrame = () => {
            const elapsed = Date.now() - startTime;
            this.animationProgress = Math.min(elapsed / duration, 1);

            // Easing function for smooth animation
            const easeProgress = 1 - Math.pow(1 - this.animationProgress, 3);

            this.clear();
            drawCallback(easeProgress);

            if (this.animationProgress < 1) {
                requestAnimationFrame(animateFrame);
            }
        };
        requestAnimationFrame(animateFrame);
    }

    drawBarChart(data, labels, title, isPriceChart = true) {
        if (!data || data.length === 0) {
            this.clear();
            this.drawNoData();
            return;
        }

        const chartWidth = this.width - this.padding.left - this.padding.right;
        const chartHeight = this.height - this.padding.top - this.padding.bottom;
        const maxValue = Math.max(...data);
        const barWidth = chartWidth / data.length * 0.7;
        const barSpacing = chartWidth / data.length;

        this.animate((progress) => {
            // Draw axes
            this.ctx.strokeStyle = COLORS.grid;
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(this.padding.left, this.padding.top);
            this.ctx.lineTo(this.padding.left, this.height - this.padding.bottom);
            this.ctx.lineTo(this.width - this.padding.right, this.height - this.padding.bottom);
            this.ctx.stroke();

            // Draw horizontal grid lines
            const numGridLines = 5;
            this.ctx.strokeStyle = '#F0F2F2';
            this.ctx.fillStyle = COLORS.text;
            this.ctx.font = '12px Proxima Nova, Arial';
            for (let i = 0; i <= numGridLines; i++) {
                const y = this.padding.top + (chartHeight / numGridLines) * i;
                const value = maxValue * (1 - i / numGridLines);
                this.ctx.beginPath();
                this.ctx.moveTo(this.padding.left, y);
                this.ctx.lineTo(this.width - this.padding.right, y);
                this.ctx.stroke();
                // Format as price or count based on chart type
                const formattedValue = isPriceChart ? formatPrice(value) : Math.round(value).toLocaleString();
                this.ctx.fillText(formattedValue, this.padding.left - 60, y + 4);
            }

            // Draw bars with animation
            data.forEach((value, index) => {
                const animatedHeight = (value / maxValue) * chartHeight * progress;
                const barHeight = animatedHeight;
                const x = this.padding.left + index * barSpacing + (barSpacing - barWidth) / 2;
                const y = this.height - this.padding.bottom - barHeight;

                // Solid color for bars
                this.ctx.fillStyle = COLORS.primary;
                this.ctx.fillRect(x, y, barWidth, barHeight);

                // Add to data points for tooltip
                if (progress === 1) {
                    const formattedValue = isPriceChart ? formatPrice(value) : Math.round(value).toLocaleString();
                    this.dataPoints.push({
                        x: x + barWidth / 2,
                        y: y,
                        radius: barWidth / 2,
                        label: `${labels[index]}: ${formattedValue}`
                    });
                }

                // Draw value on top of bar (only when fully animated)
                if (progress > 0.7) {
                    this.ctx.fillStyle = COLORS.text;
                    this.ctx.font = 'bold 12px Proxima Nova, Arial';
                    this.ctx.textAlign = 'center';
                    this.ctx.globalAlpha = (progress - 0.7) / 0.3;
                    const formattedValue = isPriceChart ? formatPrice(value) : Math.round(value).toLocaleString();
                    this.ctx.fillText(formattedValue, x + barWidth / 2, y - 5);
                    this.ctx.globalAlpha = 1;
                }
            });

            // Draw labels
            this.ctx.fillStyle = COLORS.text;
            this.ctx.font = '12px Proxima Nova, Arial';
            this.ctx.textAlign = 'center';
            labels.forEach((label, index) => {
                const x = this.padding.left + index * barSpacing + barSpacing / 2;
                const y = this.height - this.padding.bottom + 20;
                this.ctx.fillText(label, x, y);
            });
        });
    }

    drawPieChart(data, labels, colors) {
        if (!data || data.length === 0 || data.every(v => v === 0)) {
            this.clear();
            this.drawNoData();
            return;
        }

        const centerX = this.width / 2;
        const centerY = this.height / 2 - 20; // Shift up to make room for legend
        // Balanced pie chart size with proper spacing
        const radius = Math.min(this.width, this.height) / 2 - 60;
        const total = data.reduce((sum, val) => sum + val, 0);

        this.animate((progress) => {
            const animatedRadius = radius * progress;
            let currentAngle = -Math.PI / 2; // Start at top

            data.forEach((value, index) => {
                const sliceAngle = (value / total) * 2 * Math.PI;

                // Draw slice
                this.ctx.fillStyle = colors[index] || this.getColor(index);
                this.ctx.beginPath();
                this.ctx.moveTo(centerX, centerY);
                this.ctx.arc(centerX, centerY, animatedRadius, currentAngle, currentAngle + sliceAngle);
                this.ctx.closePath();
                this.ctx.fill();

                // Draw border
                this.ctx.strokeStyle = 'white';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();

                // Add to data points for tooltip
                if (progress === 1) {
                    const midAngle = currentAngle + sliceAngle / 2;
                    this.dataPoints.push({
                        x: centerX + Math.cos(midAngle) * (radius * 0.7),
                        y: centerY + Math.sin(midAngle) * (radius * 0.7),
                        radius: 20,
                        label: `${labels[index]}: ${value} (${((value/total)*100).toFixed(1)}%)`
                    });
                }

                // Draw percentage label (only when fully animated)
                if (progress > 0.8) {
                    const percentage = ((value / total) * 100).toFixed(1);
                    if (percentage > 5) {
                        const labelAngle = currentAngle + sliceAngle / 2;
                        const labelX = centerX + Math.cos(labelAngle) * (animatedRadius * 0.7);
                        const labelY = centerY + Math.sin(labelAngle) * (animatedRadius * 0.7);

                        this.ctx.fillStyle = '#212121';
                        this.ctx.font = 'bold 14px Proxima Nova, Arial';
                        this.ctx.textAlign = 'center';
                        this.ctx.textBaseline = 'middle';
                        this.ctx.globalAlpha = (progress - 0.8) / 0.2;
                        this.ctx.fillText(`${percentage}%`, labelX, labelY);
                        this.ctx.globalAlpha = 1;
                    }
                }

                currentAngle += sliceAngle;
            });

            // Draw legend at bottom
            const legendStartX = centerX - (labels.length * 60) / 2;
            const legendY = this.height - 30;

            labels.forEach((label, index) => {
                const legendX = legendStartX + (index * 60);

                // Color box
                this.ctx.fillStyle = colors[index] || this.getColor(index);
                this.ctx.fillRect(legendX, legendY, 12, 12);

                // Label text
                this.ctx.fillStyle = COLORS.text;
                this.ctx.font = '11px Proxima Nova, Arial';
                this.ctx.textAlign = 'left';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(label, legendX + 16, legendY + 6);
            });
        });
    }

    drawLineChart(data, labels, title) {
        if (!data || data.length === 0) {
            this.clear();
            this.drawNoData();
            return;
        }

        const chartWidth = this.width - this.padding.left - this.padding.right;
        const chartHeight = this.height - this.padding.top - this.padding.bottom;
        const maxValue = Math.max(...data, 1);
        const minValue = Math.min(...data, 0);
        const valueRange = maxValue - minValue || 1;
        const pointSpacing = chartWidth / (data.length - 1 || 1);

        this.animate((progress) => {
            // Draw axes
            this.ctx.strokeStyle = COLORS.grid;
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(this.padding.left, this.padding.top);
            this.ctx.lineTo(this.padding.left, this.height - this.padding.bottom);
            this.ctx.lineTo(this.width - this.padding.right, this.height - this.padding.bottom);
            this.ctx.stroke();

            // Draw horizontal grid lines
            const numGridLines = 5;
            this.ctx.strokeStyle = '#F0F2F2';
            this.ctx.fillStyle = COLORS.text;
            this.ctx.font = '12px Proxima Nova, Arial';
            for (let i = 0; i <= numGridLines; i++) {
                const y = this.padding.top + (chartHeight / numGridLines) * i;
                const value = maxValue - (valueRange / numGridLines) * i;
                this.ctx.beginPath();
                this.ctx.moveTo(this.padding.left, y);
                this.ctx.lineTo(this.width - this.padding.right, y);
                this.ctx.stroke();
                this.ctx.fillText(formatPrice(value), this.padding.left - 60, y + 4);
            }

            // Calculate how many points to draw based on animation progress
            const pointsToDraw = Math.floor(data.length * progress);

            // Draw line with animation
            this.ctx.strokeStyle = COLORS.primary;
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();

            for (let index = 0; index <= pointsToDraw; index++) {
                if (index >= data.length) break;

                const value = data[index];
                const x = this.padding.left + index * pointSpacing;
                const y = this.padding.top + chartHeight - ((value - minValue) / valueRange) * chartHeight;

                if (index === 0) {
                    this.ctx.moveTo(x, y);
                } else {
                    this.ctx.lineTo(x, y);
                }
            }
            this.ctx.stroke();

            // Draw area under line with solid color
            if (pointsToDraw > 0) {
                this.ctx.save();
                this.ctx.fillStyle = 'rgba(0, 83, 152, 0.1)';

                this.ctx.beginPath();
                this.ctx.moveTo(this.padding.left, this.height - this.padding.bottom);
                for (let index = 0; index <= pointsToDraw; index++) {
                    if (index >= data.length) break;
                    const value = data[index];
                    const x = this.padding.left + index * pointSpacing;
                    const y = this.padding.top + chartHeight - ((value - minValue) / valueRange) * chartHeight;
                    this.ctx.lineTo(x, y);
                }
                this.ctx.lineTo(this.padding.left + pointsToDraw * pointSpacing, this.height - this.padding.bottom);
                this.ctx.closePath();
                this.ctx.fill();
                this.ctx.restore();
            }

            // Draw points
            for (let index = 0; index <= pointsToDraw; index++) {
                if (index >= data.length) break;

                const value = data[index];
                const x = this.padding.left + index * pointSpacing;
                const y = this.padding.top + chartHeight - ((value - minValue) / valueRange) * chartHeight;

                // Animate point appearance
                const pointProgress = Math.min((progress * data.length - index) * 2, 1);
                if (pointProgress > 0) {
                    this.ctx.fillStyle = COLORS.secondary;
                    this.ctx.beginPath();
                    this.ctx.arc(x, y, 4 * pointProgress, 0, 2 * Math.PI);
                    this.ctx.fill();

                    // Add to data points for tooltip
                    if (progress === 1) {
                        this.dataPoints.push({
                            x: x,
                            y: y,
                            radius: 8,
                            label: `${labels[index]}: ${formatPrice(value)}`
                        });
                    }
                }
            }

            // Draw labels (show every nth label to avoid overlap)
            const labelStep = Math.ceil(labels.length / 10);
            this.ctx.fillStyle = COLORS.text;
            this.ctx.font = '11px Proxima Nova, Arial';
            this.ctx.textAlign = 'center';
            labels.forEach((label, index) => {
                if (index % labelStep === 0 || index === labels.length - 1) {
                    const x = this.padding.left + index * pointSpacing;
                    const y = this.height - this.padding.bottom + 15;
                    this.ctx.save();
                    this.ctx.translate(x, y);
                    this.ctx.rotate(-Math.PI / 4);
                    this.ctx.fillText(label, 0, 0);
                    this.ctx.restore();
                }
            });
        });
    }

    drawNoData() {
        this.ctx.fillStyle = '#424647';
        this.ctx.font = '16px Proxima Nova, Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('No data available', this.width / 2, this.height / 2);
    }

    getColor(index) {
        const colorKeys = ['arin', 'ripe', 'apnic', 'lacnic', 'afrinic'];
        return COLORS[colorKeys[index % colorKeys.length]];
    }
}

// Helper function to format price with smart decimal handling
function formatPrice(value) {
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(num)) return '$0';

    // Check if it's a whole number
    if (num % 1 === 0) {
        return '$' + num.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }

    // Has decimals, show 2 decimal places
    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Helper functions for date formatting
function formatDate(date) {
    const y = date.getFullYear();
    let m = date.getMonth() + 1;
    let d = date.getDate();
    if (m < 10) m = '0' + m;
    if (d < 10) d = '0' + d;
    return `${y}-${m}-${d}`;
}

function getStartOfCurrentYear() {
    return `${new Date().getFullYear()}-01-01`;
}

function getTomorrowDate() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDate(tomorrow);
}

// Initialize date filters to current year
function initializeDateFilters() {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);

    document.getElementById('dateFrom').value = formatDate(yearStart);
    document.getElementById('dateTo').value = formatDate(now);
}

// Initialize block size filter options
function initializeBlockSizeFilter() {
    const select = document.getElementById('blockSizeFilter');
    for (let i = 24; i >= 8; i--) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `/${i}`;
        select.appendChild(option);
    }
}

// Fetch a single page of data from API
async function fetchPage(endpoint, requestBody) {
    const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'fetchData',
            url: endpoint,
            body: JSON.stringify(requestBody)
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else if (response.success) {
                resolve(response);
            } else {
                reject(new Error(response.error || 'Unknown error'));
            }
        });
    });

    const data = JSON.parse(response.data);
    return data.items || [];
}

// Fetch all data from API using pagination
async function fetchData(endpoint, filters) {
    const allItems = [];
    const pageSize = 250; // Maximum allowed by API (min: 25, max: 250)
    let offset = 0;
    let hasMore = true;

    const baseRequestBody = {
        filter: {
            block: filters.blockSize ? [parseInt(filters.blockSize)] : [24,23,22,21,20,19,18,17,16,15,14,13,12,11,10,9,8],
            region: filters.rir ? [filters.rir] : ['arin', 'apnic', 'ripe', 'afrinic', 'lacnic']
        },
        sort: { property: 'date', direction: 'desc' }
    };

    // Add date range for prior sales (always required for this endpoint)
    if (endpoint === PRIOR_SALES_ENDPOINT) {
        baseRequestBody.filter.period = {
            from: filters.dateFrom || getStartOfCurrentYear(),
            to: filters.dateTo || getTomorrowDate()
        };
    }

    try {
        // Fetch all pages using pagination
        while (hasMore) {
            const requestBody = {
                ...baseRequestBody,
                offset: offset,
                limit: pageSize
            };

            console.log(`Fetching page: offset=${offset}, limit=${pageSize}`);
            const items = await fetchPage(endpoint, requestBody);

            if (items.length > 0) {
                allItems.push(...items);
                console.log(`Received ${items.length} items (total so far: ${allItems.length})`);
            }

            // If we received fewer items than the page size, we've reached the end
            if (items.length < pageSize) {
                hasMore = false;
                console.log(`Pagination complete. Total items: ${allItems.length}`);
            } else {
                offset += pageSize;
            }
        }

        return allItems;
    } catch (error) {
        console.error(`Error fetching data from ${endpoint}:`, error);
        throw error;
    }
}

// Parse price from various formats
function parsePrice(item) {
    let priceStr = item.pricePerAddress || item.askingPrice || item.price ||
                   item.listPrice || item.listingPrice || item.perAddress ||
                   item.asking || item.list || '';

    // Handle nested price objects
    if (typeof priceStr === 'object') {
        priceStr = priceStr.perAddress || priceStr.asking || '';
    }

    // Remove $ and convert to number
    const price = parseFloat(String(priceStr).replace(/[$,]/g, ''));
    return isNaN(price) ? 0 : price;
}

// Update statistics summary
function updateStatistics() {
    // Prior Sales Statistics
    const totalSales = filteredSalesData.length;
    const salesPrices = filteredSalesData.map(parsePrice).filter(p => p > 0);

    const avgSalePrice = salesPrices.length > 0
        ? salesPrices.reduce((a, b) => a + b, 0) / salesPrices.length
        : 0;
    const maxSalePrice = salesPrices.length > 0 ? Math.max(...salesPrices) : 0;
    const minSalePrice = salesPrices.length > 0 ? Math.min(...salesPrices) : 0;

    document.getElementById('totalSales').textContent = totalSales.toLocaleString();
    document.getElementById('avgSalePrice').textContent = formatPrice(avgSalePrice);
    document.getElementById('maxSalePrice').textContent = formatPrice(maxSalePrice);
    document.getElementById('minSalePrice').textContent = formatPrice(minSalePrice);
    document.getElementById('salesStatsRow').style.display = 'flex';

    // New Listings Statistics
    const totalListings = filteredListingsData.length;
    const listingsPrices = filteredListingsData.map(parsePrice).filter(p => p > 0);

    const avgAskingPrice = listingsPrices.length > 0
        ? listingsPrices.reduce((a, b) => a + b, 0) / listingsPrices.length
        : 0;
    const maxAskingPrice = listingsPrices.length > 0 ? Math.max(...listingsPrices) : 0;
    const minAskingPrice = listingsPrices.length > 0 ? Math.min(...listingsPrices) : 0;

    document.getElementById('totalListings').textContent = totalListings.toLocaleString();
    document.getElementById('avgAskingPrice').textContent = formatPrice(avgAskingPrice);
    document.getElementById('maxAskingPrice').textContent = formatPrice(maxAskingPrice);
    document.getElementById('minAskingPrice').textContent = formatPrice(minAskingPrice);
    document.getElementById('listingsStatsRow').style.display = 'flex';
}

// Analyze data by RIR
function analyzeByRir(data) {
    const rirCounts = {
        arin: 0,
        ripe: 0,
        apnic: 0,
        lacnic: 0,
        afrinic: 0
    };

    data.forEach(item => {
        const region = (item.region || '').toLowerCase();
        if (rirCounts.hasOwnProperty(region)) {
            rirCounts[region]++;
        }
    });

    return {
        labels: ['ARIN', 'RIPE', 'APNIC', 'LACNIC', 'AFRINIC'],
        data: [rirCounts.arin, rirCounts.ripe, rirCounts.apnic, rirCounts.lacnic, rirCounts.afrinic],
        colors: [COLORS.arin, COLORS.ripe, COLORS.apnic, COLORS.lacnic, COLORS.afrinic]
    };
}

// Analyze data by block size
function analyzeByBlockSize(data) {
    const blockCounts = {};

    data.forEach(item => {
        const block = item.block || 'Unknown';
        blockCounts[block] = (blockCounts[block] || 0) + 1;
    });

    const sortedBlocks = Object.keys(blockCounts).sort((a, b) => {
        if (a === 'Unknown') return 1;
        if (b === 'Unknown') return -1;
        return parseInt(b) - parseInt(a);
    });

    return {
        labels: sortedBlocks.map(b => `/${b}`),
        data: sortedBlocks.map(b => blockCounts[b])
    };
}

// Analyze price distribution
function analyzePriceDistribution(data) {
    const prices = data.map(parsePrice).filter(p => p > 0);

    if (prices.length === 0) {
        return { labels: [], data: [] };
    }

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const range = maxPrice - minPrice;
    const bucketSize = range / 10 || 1;

    const buckets = Array(10).fill(0);
    const bucketLabels = [];

    for (let i = 0; i < 10; i++) {
        const bucketMin = minPrice + i * bucketSize;
        const bucketMax = minPrice + (i + 1) * bucketSize;
        bucketLabels.push(`$${bucketMin.toFixed(0)}-${bucketMax.toFixed(0)}`);
    }

    prices.forEach(price => {
        const bucketIndex = Math.min(Math.floor((price - minPrice) / bucketSize), 9);
        buckets[bucketIndex]++;
    });

    return {
        labels: bucketLabels,
        data: buckets
    };
}

// Analyze average price by block size
function analyzeAvgPriceByBlockSize(data) {
    const blockPrices = {};

    data.forEach(item => {
        const block = item.block || 'Unknown';
        const price = parsePrice(item);
        if (price > 0) {
            if (!blockPrices[block]) {
                blockPrices[block] = [];
            }
            blockPrices[block].push(price);
        }
    });

    const sortedBlocks = Object.keys(blockPrices).sort((a, b) => {
        if (a === 'Unknown') return 1;
        if (b === 'Unknown') return -1;
        return parseInt(b) - parseInt(a);
    });

    const avgPrices = sortedBlocks.map(block => {
        const prices = blockPrices[block];
        return prices.reduce((a, b) => a + b, 0) / prices.length;
    });

    return {
        labels: sortedBlocks.map(b => `/${b}`),
        data: avgPrices
    };
}

// Analyze price comparison by RIR (for grouped bar chart)
function analyzePriceByRir(data) {
    const rirPrices = {
        arin: [],
        ripe: [],
        apnic: [],
        lacnic: [],
        afrinic: []
    };

    data.forEach(item => {
        const region = (item.region || '').toLowerCase();
        const price = parsePrice(item);
        if (rirPrices.hasOwnProperty(region) && price > 0) {
            rirPrices[region].push(price);
        }
    });

    const labels = ['ARIN', 'RIPE', 'APNIC', 'LACNIC', 'AFRINIC'];
    const avgPrices = ['arin', 'ripe', 'apnic', 'lacnic', 'afrinic'].map(rir => {
        const prices = rirPrices[rir];
        return prices.length > 0
            ? prices.reduce((a, b) => a + b, 0) / prices.length
            : 0;
    });

    return {
        labels: labels,
        data: avgPrices
    };
}

// Analyze price trends over time
function analyzePriceTrends(data) {
    // Group by date
    const dateGroups = {};

    data.forEach(item => {
        if (!item.date) return;

        const date = item.date.split('T')[0]; // Get date part only
        if (!dateGroups[date]) {
            dateGroups[date] = [];
        }
        dateGroups[date].push(parsePrice(item));
    });

    // Sort dates
    const sortedDates = Object.keys(dateGroups).sort();

    // Calculate average price per date
    const avgPrices = sortedDates.map(date => {
        const prices = dateGroups[date].filter(p => p > 0);
        return prices.length > 0
            ? prices.reduce((a, b) => a + b, 0) / prices.length
            : 0;
    });

    // Format dates for display
    const formattedDates = sortedDates.map(date => {
        const d = new Date(date);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    });

    return {
        labels: formattedDates,
        data: avgPrices
    };
}

// Render charts based on active view
function renderCharts() {
    const priorSalesActive = document.getElementById('priorSalesSection').classList.contains('active');
    const currentListingsActive = document.getElementById('currentListingsSection').classList.contains('active');

    if (priorSalesActive) {
        // Prior Sales Charts
        const salesRirData = analyzeByRir(filteredSalesData);
        const salesBlockData = analyzeByBlockSize(filteredSalesData);
        const salesPriceByBlockData = analyzeAvgPriceByBlockSize(filteredSalesData);
        const salesTrendData = analyzePriceTrends(filteredSalesData);

        new SimpleChart('salesByRirChart').drawPieChart(
            salesRirData.data,
            salesRirData.labels,
            salesRirData.colors
        );

        new SimpleChart('salesByBlockChart').drawBarChart(
            salesBlockData.data,
            salesBlockData.labels,
            '',
            false  // Not a price chart - show counts
        );

        new SimpleChart('salesPriceByBlockChart').drawBarChart(
            salesPriceByBlockData.data,
            salesPriceByBlockData.labels,
            '',
            true  // Price chart
        );

        new SimpleChart('salesTrendChart').drawLineChart(
            salesTrendData.data,
            salesTrendData.labels
        );
    }

    if (currentListingsActive) {
        // Current Listings Charts
        const listingsRirData = analyzeByRir(filteredListingsData);
        const listingsBlockData = analyzeByBlockSize(filteredListingsData);
        const listingsPriceByBlockData = analyzeAvgPriceByBlockSize(filteredListingsData);
        const listingsPriceByRirData = analyzePriceByRir(filteredListingsData);

        new SimpleChart('listingsByRirChart').drawPieChart(
            listingsRirData.data,
            listingsRirData.labels,
            listingsRirData.colors
        );

        new SimpleChart('listingsByBlockChart').drawBarChart(
            listingsBlockData.data,
            listingsBlockData.labels,
            '',
            false  // Not a price chart - show counts
        );

        new SimpleChart('listingsPriceByBlockChart').drawBarChart(
            listingsPriceByBlockData.data,
            listingsPriceByBlockData.labels,
            '',
            true  // Price chart
        );

        new SimpleChart('listingsPriceByRirChart').drawBarChart(
            listingsPriceByRirData.data,
            listingsPriceByRirData.labels,
            '',
            true  // Price chart
        );
    }
}

// Apply filters to data - reload from API with new filters
async function applyFilters() {
    // Reload data from API with new filter settings
    await loadData();
}

// Load data from API
async function loadData() {
    const loadingMessage = document.getElementById('loadingMessage');
    const errorMessage = document.getElementById('errorMessage');

    loadingMessage.style.display = 'block';
    errorMessage.style.display = 'none';

    try {
        const dateFrom = document.getElementById('dateFrom').value;
        const dateTo = document.getElementById('dateTo').value;
        const blockSize = document.getElementById('blockSizeFilter').value;
        const rir = document.getElementById('rirFilter').value;

        const filters = { dateFrom, dateTo, blockSize, rir };

        // Fetch prior sales data
        loadingMessage.textContent = 'Loading prior sales data...';
        priorSalesData = await fetchData(PRIOR_SALES_ENDPOINT, filters);
        console.log(`Loaded ${priorSalesData.length} prior sales records`);

        // Fetch new listings data
        loadingMessage.textContent = 'Loading new listings data...';
        newListingsData = await fetchData(NEW_LISTINGS_ENDPOINT, filters);
        console.log(`Loaded ${newListingsData.length} new listings records`);

        // Initial filter application (will use all data initially)
        filteredSalesData = priorSalesData;
        filteredListingsData = newListingsData;

        loadingMessage.textContent = 'Rendering charts...';
        updateStatistics();
        renderCharts();

        loadingMessage.style.display = 'none';
    } catch (error) {
        loadingMessage.style.display = 'none';
        errorMessage.style.display = 'block';
        errorMessage.textContent = `Error loading data: ${error.message}`;
        console.error('Error loading data:', error);
    }
}

// Toggle between views
function toggleView(viewType) {
    const priorSalesBtn = document.getElementById('viewPriorSales');
    const currentListingsBtn = document.getElementById('viewCurrentListings');
    const priorSalesSection = document.getElementById('priorSalesSection');
    const currentListingsSection = document.getElementById('currentListingsSection');
    const viewToggle = document.querySelector('.view-toggle');

    // Add init class if not present
    if (!viewToggle.classList.contains('init')) {
        viewToggle.classList.add('init');
    }

    if (viewType === 'priorSales') {
        priorSalesBtn.classList.add('active');
        currentListingsBtn.classList.remove('active');
        priorSalesSection.classList.add('active');
        currentListingsSection.classList.remove('active');
        viewToggle.classList.remove('listings-active');
    } else {
        currentListingsBtn.classList.add('active');
        priorSalesBtn.classList.remove('active');
        currentListingsSection.classList.add('active');
        priorSalesSection.classList.remove('active');
        viewToggle.classList.add('listings-active');
    }

    // Re-render charts for the active view
    renderCharts();
}

// Initialize the dashboard
document.addEventListener('DOMContentLoaded', () => {
    initializeDateFilters();
    initializeBlockSizeFilter();

    // Initialize view toggle
    const viewToggle = document.querySelector('.view-toggle');
    if (viewToggle) {
        viewToggle.classList.add('init');
    }

    // Load initial data
    loadData();

    // Set up filter button
    document.getElementById('applyFilters').addEventListener('click', applyFilters);

    // Set up view toggle buttons
    document.getElementById('viewPriorSales').addEventListener('click', () => toggleView('priorSales'));
    document.getElementById('viewCurrentListings').addEventListener('click', () => toggleView('currentListings'));

    // Handle window resize with debouncing
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            // Only re-render if we have data
            if (filteredSalesData.length > 0 || filteredListingsData.length > 0) {
                renderCharts();
            }
        }, 250);
    });
});
