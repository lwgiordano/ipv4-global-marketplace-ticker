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

// Color scheme
const COLORS = {
    primary: '#005398',
    secondary: '#0066b8',
    arin: '#FF6384',
    ripe: '#36A2EB',
    apnic: '#FFCE56',
    lacnic: '#4BC0C0',
    afrinic: '#9966FF',
    grid: '#e0e0e0',
    text: '#333'
};

// Simple Chart Library using Canvas
class SimpleChart {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.width = this.canvas.width = this.canvas.offsetWidth;
        this.height = this.canvas.height = this.canvas.offsetHeight;
        this.padding = { top: 40, right: 30, bottom: 60, left: 70 };
    }

    clear() {
        this.ctx.clearRect(0, 0, this.width, this.height);
    }

    drawBarChart(data, labels, title) {
        this.clear();
        if (!data || data.length === 0) {
            this.drawNoData();
            return;
        }

        const chartWidth = this.width - this.padding.left - this.padding.right;
        const chartHeight = this.height - this.padding.top - this.padding.bottom;
        const maxValue = Math.max(...data);
        const barWidth = chartWidth / data.length * 0.7;
        const barSpacing = chartWidth / data.length;

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
        this.ctx.strokeStyle = '#f0f0f0';
        this.ctx.fillStyle = COLORS.text;
        this.ctx.font = '11px Arial';
        for (let i = 0; i <= numGridLines; i++) {
            const y = this.padding.top + (chartHeight / numGridLines) * i;
            const value = maxValue * (1 - i / numGridLines);
            this.ctx.beginPath();
            this.ctx.moveTo(this.padding.left, y);
            this.ctx.lineTo(this.width - this.padding.right, y);
            this.ctx.stroke();
            this.ctx.fillText(Math.round(value), this.padding.left - 60, y + 4);
        }

        // Draw bars
        data.forEach((value, index) => {
            const barHeight = (value / maxValue) * chartHeight;
            const x = this.padding.left + index * barSpacing + (barSpacing - barWidth) / 2;
            const y = this.height - this.padding.bottom - barHeight;

            // Create gradient for bars
            const gradient = this.ctx.createLinearGradient(x, y, x, y + barHeight);
            gradient.addColorStop(0, COLORS.primary);
            gradient.addColorStop(1, COLORS.secondary);

            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(x, y, barWidth, barHeight);

            // Draw value on top of bar
            this.ctx.fillStyle = COLORS.text;
            this.ctx.font = 'bold 11px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(value, x + barWidth / 2, y - 5);
        });

        // Draw labels
        this.ctx.fillStyle = COLORS.text;
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        labels.forEach((label, index) => {
            const x = this.padding.left + index * barSpacing + barSpacing / 2;
            const y = this.height - this.padding.bottom + 20;
            this.ctx.fillText(label, x, y);
        });
    }

    drawPieChart(data, labels, colors) {
        this.clear();
        if (!data || data.length === 0 || data.every(v => v === 0)) {
            this.drawNoData();
            return;
        }

        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const radius = Math.min(this.width, this.height) / 2 - 80;
        const total = data.reduce((sum, val) => sum + val, 0);

        let currentAngle = -Math.PI / 2; // Start at top

        data.forEach((value, index) => {
            const sliceAngle = (value / total) * 2 * Math.PI;

            // Draw slice
            this.ctx.fillStyle = colors[index] || this.getColor(index);
            this.ctx.beginPath();
            this.ctx.moveTo(centerX, centerY);
            this.ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
            this.ctx.closePath();
            this.ctx.fill();

            // Draw border
            this.ctx.strokeStyle = 'white';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            // Draw percentage label
            const percentage = ((value / total) * 100).toFixed(1);
            if (percentage > 5) { // Only show if slice is large enough
                const labelAngle = currentAngle + sliceAngle / 2;
                const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
                const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);

                this.ctx.fillStyle = 'white';
                this.ctx.font = 'bold 12px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(`${percentage}%`, labelX, labelY);
            }

            currentAngle += sliceAngle;
        });

        // Draw legend
        const legendX = 20;
        let legendY = this.height - this.padding.bottom - (labels.length * 25);

        labels.forEach((label, index) => {
            // Color box
            this.ctx.fillStyle = colors[index] || this.getColor(index);
            this.ctx.fillRect(legendX, legendY, 15, 15);

            // Label text
            this.ctx.fillStyle = COLORS.text;
            this.ctx.font = '12px Arial';
            this.ctx.textAlign = 'left';
            this.ctx.textBaseline = 'top';
            this.ctx.fillText(`${label} (${data[index]})`, legendX + 20, legendY);

            legendY += 25;
        });
    }

    drawLineChart(data, labels, title) {
        this.clear();
        if (!data || data.length === 0) {
            this.drawNoData();
            return;
        }

        const chartWidth = this.width - this.padding.left - this.padding.right;
        const chartHeight = this.height - this.padding.top - this.padding.bottom;
        const maxValue = Math.max(...data, 1);
        const minValue = Math.min(...data, 0);
        const valueRange = maxValue - minValue || 1;

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
        this.ctx.strokeStyle = '#f0f0f0';
        this.ctx.fillStyle = COLORS.text;
        this.ctx.font = '11px Arial';
        for (let i = 0; i <= numGridLines; i++) {
            const y = this.padding.top + (chartHeight / numGridLines) * i;
            const value = maxValue - (valueRange / numGridLines) * i;
            this.ctx.beginPath();
            this.ctx.moveTo(this.padding.left, y);
            this.ctx.lineTo(this.width - this.padding.right, y);
            this.ctx.stroke();
            this.ctx.fillText('$' + Math.round(value), this.padding.left - 60, y + 4);
        }

        // Draw line
        this.ctx.strokeStyle = COLORS.primary;
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();

        const pointSpacing = chartWidth / (data.length - 1 || 1);

        data.forEach((value, index) => {
            const x = this.padding.left + index * pointSpacing;
            const y = this.padding.top + chartHeight - ((value - minValue) / valueRange) * chartHeight;

            if (index === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        });
        this.ctx.stroke();

        // Draw points
        data.forEach((value, index) => {
            const x = this.padding.left + index * pointSpacing;
            const y = this.padding.top + chartHeight - ((value - minValue) / valueRange) * chartHeight;

            this.ctx.fillStyle = COLORS.secondary;
            this.ctx.beginPath();
            this.ctx.arc(x, y, 4, 0, 2 * Math.PI);
            this.ctx.fill();
        });

        // Draw labels (show every nth label to avoid overlap)
        const labelStep = Math.ceil(labels.length / 10);
        this.ctx.fillStyle = COLORS.text;
        this.ctx.font = '10px Arial';
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
    }

    drawNoData() {
        this.ctx.fillStyle = '#999';
        this.ctx.font = '14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('No data available', this.width / 2, this.height / 2);
    }

    getColor(index) {
        const colorKeys = ['arin', 'ripe', 'apnic', 'lacnic', 'afrinic'];
        return COLORS[colorKeys[index % colorKeys.length]];
    }
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

// Fetch data from API
async function fetchData(endpoint, filters) {
    const requestBody = {
        filter: {
            block: filters.blockSize ? [parseInt(filters.blockSize)] : [24,23,22,21,20,19,18,17,16,15,14,13,12,11,10,9,8],
            region: filters.rir ? [filters.rir] : ['arin', 'apnic', 'ripe', 'afrinic', 'lacnic']
        },
        sort: { property: 'date', direction: 'desc' },
        offset: 0,
        limit: 1000 // Get more data for analysis
    };

    // Add date range for prior sales (always required for this endpoint)
    if (endpoint === PRIOR_SALES_ENDPOINT) {
        requestBody.filter.period = {
            from: filters.dateFrom || getStartOfCurrentYear(),
            to: filters.dateTo || getTomorrowDate()
        };
    }

    try {
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
    const totalSales = filteredSalesData.length;
    const totalListings = filteredListingsData.length;

    const salesPrices = filteredSalesData.map(parsePrice).filter(p => p > 0);
    const listingsPrices = filteredListingsData.map(parsePrice).filter(p => p > 0);

    const avgSalePrice = salesPrices.length > 0
        ? salesPrices.reduce((a, b) => a + b, 0) / salesPrices.length
        : 0;

    const avgAskingPrice = listingsPrices.length > 0
        ? listingsPrices.reduce((a, b) => a + b, 0) / listingsPrices.length
        : 0;

    document.getElementById('totalSales').textContent = totalSales.toLocaleString();
    document.getElementById('totalListings').textContent = totalListings.toLocaleString();
    document.getElementById('avgSalePrice').textContent = '$' + avgSalePrice.toFixed(2);
    document.getElementById('avgAskingPrice').textContent = '$' + avgAskingPrice.toFixed(2);

    document.getElementById('statsRow').style.display = 'flex';
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

// Render all charts
function renderCharts() {
    // Prior Sales Charts
    const salesRirData = analyzeByRir(filteredSalesData);
    const salesBlockData = analyzeByBlockSize(filteredSalesData);
    const salesPriceDistData = analyzePriceDistribution(filteredSalesData);
    const salesTrendData = analyzePriceTrends(filteredSalesData);

    new SimpleChart('salesByRirChart').drawPieChart(
        salesRirData.data,
        salesRirData.labels,
        salesRirData.colors
    );

    new SimpleChart('salesByBlockChart').drawBarChart(
        salesBlockData.data,
        salesBlockData.labels
    );

    new SimpleChart('salesPriceDistChart').drawBarChart(
        salesPriceDistData.data,
        salesPriceDistData.labels
    );

    new SimpleChart('salesTrendChart').drawLineChart(
        salesTrendData.data,
        salesTrendData.labels
    );

    // New Listings Charts
    const listingsRirData = analyzeByRir(filteredListingsData);
    const listingsBlockData = analyzeByBlockSize(filteredListingsData);
    const listingsPriceDistData = analyzePriceDistribution(filteredListingsData);
    const listingsTrendData = analyzePriceTrends(filteredListingsData);

    new SimpleChart('listingsByRirChart').drawPieChart(
        listingsRirData.data,
        listingsRirData.labels,
        listingsRirData.colors
    );

    new SimpleChart('listingsByBlockChart').drawBarChart(
        listingsBlockData.data,
        listingsBlockData.labels
    );

    new SimpleChart('listingsPriceDistChart').drawBarChart(
        listingsPriceDistData.data,
        listingsPriceDistData.labels
    );

    new SimpleChart('listingsTrendChart').drawLineChart(
        listingsTrendData.data,
        listingsTrendData.labels
    );
}

// Apply filters to data
function applyFilters() {
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;
    const blockSize = document.getElementById('blockSizeFilter').value;
    const rir = document.getElementById('rirFilter').value;

    // Filter sales data
    filteredSalesData = priorSalesData.filter(item => {
        // Date filter
        if (dateFrom && item.date && item.date < dateFrom) return false;
        if (dateTo && item.date && item.date > dateTo) return false;

        // Block size filter
        if (blockSize && item.block != blockSize) return false;

        // RIR filter
        if (rir && item.region && item.region.toLowerCase() !== rir.toLowerCase()) return false;

        return true;
    });

    // Filter listings data
    filteredListingsData = newListingsData.filter(item => {
        // Block size filter
        if (blockSize && item.block != blockSize) return false;

        // RIR filter
        if (rir && item.region && item.region.toLowerCase() !== rir.toLowerCase()) return false;

        return true;
    });

    updateStatistics();
    renderCharts();
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

        // Fetch both datasets in parallel
        const [salesData, listingsData] = await Promise.all([
            fetchData(PRIOR_SALES_ENDPOINT, filters),
            fetchData(NEW_LISTINGS_ENDPOINT, filters)
        ]);

        priorSalesData = salesData;
        newListingsData = listingsData;

        // Initial filter application (will use all data initially)
        filteredSalesData = priorSalesData;
        filteredListingsData = newListingsData;

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

// Initialize the dashboard
document.addEventListener('DOMContentLoaded', () => {
    initializeDateFilters();
    initializeBlockSizeFilter();

    // Load initial data
    loadData();

    // Set up filter button
    document.getElementById('applyFilters').addEventListener('click', applyFilters);
});
