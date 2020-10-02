//@ts-ignore
const chardet = window.chardet
//@ts-ignore
const iconv = window.iconv

// import Swal from "sweetalert2"
declare var Swal: any

// import type * as bulmaToast2 from "bulma-toast";
declare var bulmaToast: any

//we are inside the browser

let initialContentAsArrayBuffer: Uint8Array | null = null

const defaultToastDurationInMs = 3000

const fallbackEncodingUTF8 = 'UTF-8'

/**
 * this is changed to the file name we read
 */
let defaultCsvFileName = `csvFile.csv`
let dragCounter = 0 //see https://stackoverflow.com/questions/7110353/html5-dragleave-fired-when-hovering-a-child-element



//--- html refs
const dropZoneOverlayDiv = _getById(`drop-file-overlay`) as HTMLDivElement
const csvFileInput = _getById(`csv-file-input`) as HTMLInputElement

const readOptionEncodingSelect = _getById(`read-option-encoding`) as HTMLSelectElement
const writeOptionEncodingSelect = _getById(`write-option-encoding`) as HTMLSelectElement
const readOptionAutoEncodingOption = _getById(`read-option-encoding-auto`) as HTMLOptionElement

//--- side stats
const statSelectedRows = _getById(`stat-selected-rows`) as HTMLDivElement
const statSelectedCols = _getById(`stat-selected-cols`) as HTMLDivElement
const statRowsCount = _getById(`stat-rows-count`) as HTMLDivElement
const statColsCount = _getById(`stat-cols-count`) as HTMLDivElement
const statSelectedCellsCount = _getById(`stat-selected-cells-count`) as HTMLDivElement
const statSelectedNotEmptyCells = _getById(`stat-selected-not-empty-cells`) as HTMLDivElement
const statSumOfNumbers = _getById(`stat-sum-of-numbers`) as HTMLDivElement


//--- modals
const changelogModalDiv = _getById(`changelog-modal`) as HTMLDivElement


/** encoding of the last read operation when auto detect is enabled */
let _lastDetectedReadEncoding: string | null = null


const autoDetectReadEncodingValue = `auto`
const sameAsReadWriteEncodingValue = autoDetectReadEncodingValue
//all from https://github.com/runk/node-chardet
//and check https://github.com/ashtuchkin/iconv-lite (iconv.getCodec throws an error)
const supportedAutoDetectEncodings: SupportedEncoding[] = [
	{ name: 'UTF-8', internalName: 'UTF-8', autoDetecting: true },
	{ name: 'UTF-16 (no auto detect)', internalName: 'UTF-16', autoDetecting: false },
	{ name: 'UTF-16 LE', internalName: 'UTF-16 LE', autoDetecting: true },
	{ name: 'UTF-16 BE', internalName: 'UTF-16 BE', autoDetecting: true },
	{ name: 'UTF-32 (no auto detect)', internalName: 'UTF-32', autoDetecting: false },
	{ name: 'UTF-32 LE', internalName: 'UTF-32 LE', autoDetecting: true },
	{ name: 'UTF-32 BE', internalName: 'UTF-32 BE', autoDetecting: true },
	{ name: 'Shift_JIS', internalName: 'Shift_JIS', autoDetecting: true },
	{ name: 'Big5', internalName: 'Big5', autoDetecting: true },
	{ name: 'EUC-JP', internalName: 'EUC-JP', autoDetecting: true },
	{ name: 'EUC-KR / cp949', internalName: 'EUC-KR / cp949', autoDetecting: true },
	{ name: 'GB18030', internalName: 'GB18030', autoDetecting: true },
	{ name: 'ISO-8859-1', internalName: 'ISO-8859-1', autoDetecting: true },
	{ name: 'ISO-8859-2', internalName: 'ISO-8859-2', autoDetecting: true },
	{ name: 'ISO-8859-5', internalName: 'ISO-8859-5', autoDetecting: true },
	{ name: 'ISO-8859-6', internalName: 'ISO-8859-6', autoDetecting: true },
	{ name: 'ISO-8859-7', internalName: 'ISO-8859-7', autoDetecting: true },
	{ name: 'ISO-8859-8', internalName: 'ISO-8859-8', autoDetecting: true },
	{ name: 'ISO-8859-9', internalName: 'ISO-8859-9', autoDetecting: true },
	{ name: 'windows-1250', internalName: 'windows-1250', autoDetecting: true },
	{ name: 'windows-1251', internalName: 'windows-1251', autoDetecting: true },
	{ name: 'windows-1252', internalName: 'windows-1252', autoDetecting: true },
	{ name: 'windows-1253', internalName: 'windows-1253', autoDetecting: true },
	{ name: 'windows-1254', internalName: 'windows-1254', autoDetecting: true },
	{ name: 'windows-1255', internalName: 'windows-1255', autoDetecting: true },
	{ name: 'windows-1256', internalName: 'windows-1256', autoDetecting: true },
	{ name: 'KOI8-R', internalName: 'KOI8-R', autoDetecting: true },
]

supportedAutoDetectEncodings.forEach((p, index) => {
	const opt = document.createElement(`option`)
	opt.innerText = p.name
	opt.value = `${index}`
	readOptionEncodingSelect.appendChild(opt)
})

supportedAutoDetectEncodings.forEach((p, index) => {
	const opt = document.createElement(`option`)
	opt.innerText = p.name
	opt.value = `${index}`
	writeOptionEncodingSelect.appendChild(opt)
})

const fallbackEncodingIndex = supportedAutoDetectEncodings.findIndex(p => p.internalName === fallbackEncodingUTF8)
if (fallbackEncodingIndex === -1) throw new Error(`could not find fallback encoding in supported encodings list`)
writeOptionEncodingSelect.value = `${fallbackEncodingIndex}`

//--- set the initial preferred end of line terminator depending on OS
//see https://gist.github.com/hkulekci/3433850
let detectedOs: 'unknown' | 'mac' | 'unix' | 'win' = 'unknown'

if (navigator.appVersion.indexOf("Win") !== -1) detectedOs = "win";
if (navigator.appVersion.indexOf("Mac") !== -1) detectedOs = "mac";
if (navigator.appVersion.indexOf("X11") !== -1) detectedOs = "unix";
if (navigator.appVersion.indexOf("Linux") !== -1) detectedOs = "unix";

switch (detectedOs) {
	case "mac":
	case "unix":
	case "unknown": {
		newLineFromInput = `\n`
		break
	}

	case "win": {
		newLineFromInput = `\r\n`
		break
	}
	default: notExhaustiveSwitch(detectedOs)
}

updateNewLineSelect()

//--- END set the preferred end of line terminator


//select write option to be UTF-8... there are a number of reasons...
/*
1. nowadays UTF-8 can be handled by almost all programs (even notepad!)
2. auto detect encoding will often detect a different encoding if the text only contains non-UTF-8 characters
	thus `same as read` would not be UTF-8 but this is probably wanted 99% of the time
3. why use another encoding thatn UTF-8? there are only some rare cases and then the user can manually select
*/


bindEvent(`drag dragstart dragend dragover dragenter dragleave drop`, (e: Event) => {
	e.preventDefault()
	e.stopPropagation()
})

// document.body.addEventListener('dragover', onCsvFileOver, false)
document.body.addEventListener('dragenter', onCsvFileOver, false)

document.body.addEventListener('dragleave', onCsvFileOut, false)
// document.body.addEventListener('dragend', onCsvFileOut, false)
document.body.addEventListener('drop', onCsvFileOut, false)

document.body.addEventListener('drop', async (e) => {

	if (!e.dataTransfer) return

	onFileList(e.dataTransfer.files)

})


csvFileInput.addEventListener('change', (e: Event) => {

	//@ts-ignore
	const files = e.target.files as FileList
	onFileList(files)
	//clear so we can select the same file again
	csvFileInput.value = ``
})


function onCsvFileOver(e: Event) {
	dropZoneOverlayDiv.classList.remove(`op-hidden`)
	dragCounter++
}

function onCsvFileOut(e: Event) {
	dragCounter--

	if (dragCounter === 0) {
		dropZoneOverlayDiv.classList.add(`op-hidden`)
	}
}


async function onFileList(fileList: FileList) {

	if (fileList.length === 0) return

	if (fileList.length > 1) {
		alert('Please only select only one csv file')
		return
	}

	const file = fileList.item(0)
	if (!file) return

	defaultCsvFileName = file.name

	const fileReader = new FileReader()

	fileReader.onloadstart = (e) => {
		startReceiveCsvProgBar()
	}

	fileReader.onprogress = (e) => {
		receivedCsvProgBar.value = e.loaded * 100 / e.total
	}

	statusInfo.innerText = `Loading file, detecting encoding, decoding file...`

	fileReader.onloadend = (e) => {
		stopReceiveCsvProgBar()

		if (fileReader.error) {
			console.log(`could not load file`, fileReader.error)
			Swal.fire('Error', `Could not load file: ${fileReader.error.message}`, 'error')
			return
		}

		//TODO only use first 1000 bytes??
		const buffer = new Uint8Array(fileReader.result as ArrayBuffer)
		let encoding: string | null = 'UTF-8'

		//get the encoding
		{
			let selectedEncoding = supportedAutoDetectEncodings.find((p, index) => `${index}` === readOptionEncodingSelect.value)

			encoding = selectedEncoding
				? selectedEncoding.internalName
				: chardet.detect(buffer) as string | null

			if (encoding) {
				console.log(`guessed encoding is '${encoding}'`)
				readOptionAutoEncodingOption.innerText = `Auto detect (${encoding})`
				_lastDetectedReadEncoding = encoding //set the last result for the write operation

			} else {
				console.log(`could not guessed encoding, using UTF-8`)
				encoding = 'UTF-8'
				readOptionEncodingSelect.value = autoDetectReadEncodingValue
				_lastDetectedReadEncoding = encoding //set the last result for the write operation

				Swal.fire('Auto detect encoding error', `Could not automatically detect file encoding, defaulting to UTF-8`, 'warning')
			}
		}

		initialContentAsArrayBuffer = buffer
		const decodedText = iconv.decode(buffer, encoding)
		openCsvText(decodedText)
	}

	fileReader.readAsArrayBuffer(file)
}

//TODO re-read should use selected encoding read option
// ---> save blob not text...
//write encoding option

function bindEvent(eventNames: string, handler: Function) {

	let _eventNames = eventNames.split(` `)

	for (let i = 0; i < _eventNames.length; i++) {
		const element = _eventNames[i]
		//@ts-ignore
		document.body.addEventListener(element, handler, false)
	}
}


function openCsvText(text: string) {

	initialContent = text
	resetDataFromResetDialog()

}


/**
 * downloads the csv content as file
 */
function downloadAsFile(): void {

	const csvContent = getDataAsCsv(defaultCsvReadOptions, defaultCsvWriteOptions)

	let encoding: string | null = null
	{
		let selectedEncoding = supportedAutoDetectEncodings.find((p, index) => `${index}` === writeOptionEncodingSelect.value)

		encoding = selectedEncoding
			? selectedEncoding.internalName
			: autoDetectReadEncodingValue //same as read

		if (encoding === autoDetectReadEncodingValue) {
			encoding = getReadOptionEncoding()

			if (encoding === null) return
		}

		console.log(`write is using encoding ${autoDetectReadEncodingValue}`)
	}

	const buff = iconv.encode(csvContent, encoding) as Uint8Array

	const blob = new Blob([buff], {
		type: `text/csv`,
	})

	const url = window.URL.createObjectURL(blob)

	const aDownload = document.createElement(`a`)
	aDownload.download = defaultCsvFileName
	aDownload.href = url
	aDownload.style.display = `none`
	document.body.appendChild(aDownload)
	aDownload.click()
	document.body.removeChild(aDownload)

	window.URL.revokeObjectURL(url)

	//used to clear focus... else styles are not properly applied (clears btn border)
	//@ts-ignore
	if (document.activeElement !== document.body) document.activeElement.blur();
}


/**
 * returns the selected read option encoding
 * if auto detect is selected it returns the last guessed encoding
 * 	if the last guessed encoding failed (null) a toast is displayed and the fallback encoding is returned
 */
function getReadOptionEncoding(): string {

	let selectedEncoding = supportedAutoDetectEncodings.find((p, index) => `${index}` === readOptionEncodingSelect.value)

	let encoding = selectedEncoding
		? selectedEncoding.internalName
		: autoDetectReadEncodingValue

	//an encoding was selected (manually)
	if (encoding !== autoDetectReadEncodingValue) {
		return encoding
	}

	//auto detect is enabled... use the last read encoding
	if (_lastDetectedReadEncoding === null) {
		bulmaToast.toast({
			message: `Could not get the read option auto guessed encoding. Defaulting to ${fallbackEncodingUTF8}`,
			duration: defaultToastDurationInMs,
		})
		return fallbackEncodingUTF8
	}

	return _lastDetectedReadEncoding
}

/**
 * same as resetDataFromResetDialog but we use the read buffer so we can apply the changed encoding
 */
function resetDataFromResetDialogWithEncoding() {

	toggleAskReadAgainModal(false)

	if (initialContentAsArrayBuffer === null) {
		bulmaToast.toast({
			message: `No file was loaded, thus data could not be reset.`,
			duration: defaultToastDurationInMs,
		})
		return
	}

	postSetEditorHasChanges(false)

	const encoding = getReadOptionEncoding()

	const decodedText = iconv.decode(initialContentAsArrayBuffer, encoding)
	initialContent = decodedText

	startRenderData()
}


function toggleChangelogModal(isVisible: boolean) {
	if (isVisible) {
		changelogModalDiv.classList.add('is-active')
		return
	}

	changelogModalDiv.classList.remove('is-active')
}

//taken from https://github.com/MikeMcl/big.js/blob/master/big.js
const numberRegex = /-?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?/
function afterHandsontableCreated(hot: Handsontable) {

	/**
	 * @param row Selection start visual row index.
	 * @param column Selection start visual column index.
	 * @param row2 Selection end visual row index.
	 * @param column2 Selection end visual column index.
	 */
	const afterSelectionHandler = (row: number, column: number, row2: number, column2: number) => {
		let rowsCount = Math.abs(row2 - row) + 1
		let colsCount = Math.abs(column2 - column) + 1
		statSelectedRows.innerText = `${rowsCount}`
		// statSelectedNotEmptyRows
		statSelectedCols.innerText = `${colsCount}`
		// statSelectedNotEmptyCols
		statSelectedCellsCount.innerText = `${rowsCount * colsCount}`

		//could be improved when we iterate over cols when we have less cols than rows??
		let notEmptyCount = 0
		let numbersSum = Big(0)
		let containsInvalidNumbers = false
		let minR = Math.min(row, row2)
		let maxR = Math.max(row, row2)
		for (let index = minR; index <= maxR; index++) {
			const data = hot.getDataAtRow(index)

			let minC = Math.min(column, column2)
			let maxC = Math.max(column, column2)

			for (let i = minC; i <= maxC; i++) {
				const el = data[i]

				if (el !== '' && el !== null) {
					notEmptyCount++

					if (!containsInvalidNumbers) {
						let numberRegexRes = numberRegex.exec(el)

						if (!numberRegexRes || numberRegexRes.length === 0) continue

						try {
							let _num = Big(numberRegexRes[0])
							numbersSum = numbersSum.plus(_num)
						} catch (error) {
							console.log(`could not create or add number to statSumOfNumbers at row: ${index}, col: ${i}`, error)
							containsInvalidNumbers = true
						}
					}
				}
			}
		}

		statSelectedNotEmptyCells.innerText = `${notEmptyCount}`
		statSumOfNumbers.innerText = containsInvalidNumbers
			? `Some invalid num`
			: `${numbersSum}`
	}

	hot.addHook('afterSelection', afterSelectionHandler as any)

	const afterRowOrColsCountChangeHandler = () => {
		statRowsCount.innerText = `${hot.countRows()}`
		statColsCount.innerText = `${hot.countCols()}`
	}

	hot.addHook('afterRemoveRow', afterRowOrColsCountChangeHandler)
	hot.addHook('afterCreateRow', afterRowOrColsCountChangeHandler)
	hot.addHook('afterCreateCol', afterRowOrColsCountChangeHandler)
	hot.addHook('afterRemoveCol', afterRowOrColsCountChangeHandler)

	statSelectedRows.innerText = `${0}`
	statSelectedCols.innerText = `${0}`
	statSelectedNotEmptyCells.innerText = `${0}`
	statSumOfNumbers.innerText = `${0}`
	statSelectedCellsCount.innerText = `${0}`
	statRowsCount.innerText = `${hot.countRows()}`
	statColsCount.innerText = `${hot.countCols()}`
}

//because main.ts is loaded before this the first init must be manually...

afterHandsontableCreated(hot!)

//--------- setup keybindings

Mousetrap.bindGlobal(['meta+s', 'ctrl+s'], (e) => {
	e.preventDefault()
	downloadAsFile()
})


//--- setup vscode hooks for browser

postVsError = (error: string) => {
	Swal.fire(`Error`, `${error}`, `error`)
}