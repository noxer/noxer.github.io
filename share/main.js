// Initialize PeerJS
let peer;
let connections = {}; // Object to store connections and their associated data

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const peerIdContainer = document.getElementById('peerIdContainer');
const peerIdUrl = document.getElementById('peerIdUrl');
const progressBarsContainer = document.getElementById('progressBarsContainer');

// Hide the dropZone if the page is opened with a peerId parameter (receiver side)
const urlParams = new URLSearchParams(window.location.search);
const peerIdParam = urlParams.get('peerId');
if (peerIdParam) {
    dropZone.classList.add('hidden'); // Hide file input for receiver
    initializeReceiver(peerIdParam);
} else {
    initializeSender();
}

// Event listener for click on drop zone to open file dialog
dropZone.addEventListener('click', () => {
    fileInput.click();
});

// Handle drag over and drag leave for visual feedback
dropZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropZone.classList.add('active');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('active');
});

// Handle file drop event
dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropZone.classList.remove('active');

    const file = event.dataTransfer.files[0];
    if (file) {
        handleFile(file);
    }
});

// Handle file input change event
fileInput.addEventListener('change', function (event) {
    const file = event.target.files[0];
    if (file) {
        handleFile(file);
    }
});

// Function to handle the file selection and connection setup
function handleFile(file) {
    // Hide the drop zone and show the peer ID container
    dropZone.classList.add('hidden');
    peerIdContainer.classList.remove('hidden');

    // Initialize PeerJS and create a unique peer ID
    peer = new Peer();

    peer.on('open', (id) => {
        // Display the generated peer ID as a URL
        const url = `https://blog.plusmid.dev/share?peerId=${id}`;
        peerIdUrl.textContent = url;
    });

    // Wait for connections from other peers
    peer.on('connection', (incomingConn) => {
        const connId = incomingConn.peer.slice(0, 6); // Create a short ID for display
        connections[incomingConn.peer] = { conn: incomingConn, progress: 0 };

        incomingConn.on('open', () => {
            // Hide dropZone when a receiver connects
            dropZone.classList.add('hidden');

            // Trigger pulsing animation on the body when connected
            document.body.classList.add('pulsing-background');

            // Create progress bar for the receiver
            createProgressBar(connId, incomingConn);

            // Send file metadata before sending file chunks
            incomingConn.send({
                type: 'metadata',
                size: file.size,
                name: file.name, // Include file name in metadata
            });

            // Send the file in chunks and track progress
            sendFile(file, incomingConn);
        });

        incomingConn.on('close', () => {
            // Keep progress bar after connection closes
            // Display final percentage
            displayFinalProgress(connId);
        });
    });
}

// Function to send a file in chunks and update the progress bar
function sendFile(file, connection) {
    const chunkSize = 16 * 1024; // 16KB chunks
    let offset = 0;
    let startTime = Date.now(); // Start time for speed calculation

    function sendNextChunk() {
        const chunk = file.slice(offset, offset + chunkSize);
        connection.send(chunk);
        offset += chunkSize;

        const elapsedTime = (Date.now() - startTime) / 1000; // Time in seconds
        const speed = (offset / 1024 / elapsedTime).toFixed(2); // Speed in KB/s
        const percentage = Math.min(((offset / file.size) * 100).toFixed(2), 100); // Ensure max is 100%

        // Update progress bar and display speed
        updateProgressBar(connection.peer.slice(0, 6), percentage, speed + " KB/s");

        if (offset < file.size) {
            setTimeout(sendNextChunk, 30); // Send next chunk after a short delay
        } else {
            console.log('File sent successfully.');
        }
    }

    sendNextChunk();
}

// Function to create a progress bar for each receiver
function createProgressBar(shortId, connection) {
    const wrapper = document.createElement('div');
    wrapper.className = 'progress-bar-wrapper';
    wrapper.id = `progress-bar-wrapper-${shortId}`;

    const label = document.createElement('p');
    label.textContent = `Receiver ${shortId} Progress:`;

    const progressBar = document.createElement('progress');
    progressBar.id = `progress-${shortId}`;
    progressBar.value = 0;
    progressBar.max = 100;

    const progressInfo = document.createElement('div');
    progressInfo.id = `progress-info-${shortId}`;
    progressInfo.className = 'progress-info';
    progressInfo.textContent = '0%';

    const connectionTypeHint = document.createElement('div');
    connectionTypeHint.id = `connection-type-${shortId}`;
    connectionTypeHint.className = 'progress-info';
    connectionTypeHint.textContent = connection.peerConnection ? (connection.peerConnection.iceConnectionState === "connected" ? 'Direct Connection' : 'Relayed Connection') : 'Unknown Connection Type';

    wrapper.appendChild(label);
    wrapper.appendChild(progressBar);
    wrapper.appendChild(progressInfo);
    wrapper.appendChild(connectionTypeHint);
    progressBarsContainer.appendChild(wrapper);
}

// Function to remove a progress bar
function removeProgressBar(shortId) {
    const wrapper = document.getElementById(`progress-bar-wrapper-${shortId}`);
    if (wrapper) {
        wrapper.remove();
    }
}

// Function to update a specific receiver's progress bar
function updateProgressBar(shortId, percentage, speedText) {
    const progressBar = document.getElementById(`progress-${shortId}`);
    const progressInfo = document.getElementById(`progress-info-${shortId}`);
    if (progressBar && progressInfo) {
        progressBar.value = percentage;
        progressInfo.textContent = `${percentage}% (${speedText})`;
    }
}

// Function to display final progress after connection closes
function displayFinalProgress(shortId) {
    const progressBar = document.getElementById(`progress-${shortId}`);
    const progressInfo = document.getElementById(`progress-info-${shortId}`);
    if (progressBar && progressInfo) {
        progressInfo.textContent = `${progressBar.value}% - Transfer Complete`;
    }
}

// Initialize receiver
function initializeReceiver(peerId) {
    peer = new Peer();

    peer.on('open', () => {
        // Automatically connect to the provided peer ID
        const conn = peer.connect(peerId);

        conn.on('open', () => {
            // Trigger pulsing animation on the body when connected
            document.body.classList.add('pulsing-background');

            // Show progress bar for download with a unique short ID
            const connId = conn.peer.slice(0, 6);
            createProgressBar(connId, conn);

            conn.on('data', (data) => {
                if (data.type === 'metadata') {
                    // Store the file size and name metadata
                    conn.metadata = data;
                    receivedChunks = []; // Reset chunks
                    receivedSize = 0; // Reset size
                    lastReceivedSize = 0; // Reset last received size for speed calculation
                    lastTime = Date.now(); // Reset last time for speed calculation
                } else {
                    receiveFileChunk(data, conn);
                }
            });

            conn.on('close', () => {
                displayFinalProgress(conn.peer.slice(0, 6));
            });
        });
    });
}

// Initialize sender
function initializeSender() {
    // Additional logic for sender initialization can go here
}

// Function to handle received file chunks
let receivedChunks = [];
let receivedSize = 0;
let lastReceivedSize = 0;
let lastTime = Date.now();

function receiveFileChunk(chunk, conn) {
    receivedChunks.push(chunk);
    receivedSize += chunk.byteLength;

    if (conn.metadata && conn.metadata.size) {
        const elapsedTime = (Date.now() - lastTime) / 1000; // Time in seconds
        const receivedSinceLast = receivedSize - lastReceivedSize;
        const speed = (receivedSinceLast / 1024 / elapsedTime).toFixed(2); // Speed in KB/s
        lastTime = Date.now();
        lastReceivedSize = receivedSize;

        const percentage = Math.min(((receivedSize / conn.metadata.size) * 100).toFixed(2), 100); // Ensure max is 100%
        updateProgressBar(conn.peer.slice(0, 6), percentage, speed + " KB/s");
    }

    if (receivedSize >= conn.metadata.size) {
        const blob = new Blob(receivedChunks);
        const url = URL.createObjectURL(blob);
        const fileList = document.getElementById('fileList');
        const link = document.createElement('a');
        link.href = url;
        link.download = conn.metadata.name || 'downloaded-file'; // Use the file name from metadata
        link.textContent = `Download ${conn.metadata.name || 'downloaded-file'}`;
        fileList.appendChild(link);

        // Reset chunks and size for next file
        receivedChunks = [];
        receivedSize = 0;
    }
}
